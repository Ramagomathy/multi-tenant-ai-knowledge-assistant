import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { validateRequestOrigin } from "@/lib/security/csrf";
import { enforceRateLimit } from "@/modules/security/services/rate-limit.service";

import { connectToDatabase } from "@/lib/db/mongoose";
import { AppError, handleApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

import { Document } from "@/modules/documents/models/Documents";
import {
    storeFile,
    deleteStoredFile,
} from "@/modules/documents/services/file-storage.service";

import {
    validateDocumentFile,
    validateFileContent,
    sanitizeFilename,
} from "@/modules/documents/utils/file-validation";

import { calculateFileHash } from "@/modules/documents/utils/file-hash";

import { z } from "zod";

import { IngestionJob } from "@/modules/ingestion/models/IngestionJob";

// export const runtime = "nodejs";

const listQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});

function isDuplicateKeyError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === 11000
    );
}

// GET: List documents belonging to the authenticated organization.
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth();
        await connectToDatabase();

        const params = Object.fromEntries(
            new URL(request.url).searchParams
        );

        const { page, limit } = listQuerySchema.parse(params);

        const filter = {
            organizationId: auth.organizationId,
        };

        const [documents, total] = await Promise.all([
            Document.find(filter)
                .select(
                    "_id originalName mimeType size status uploadedBy createdAt updatedAt"
                )
                .sort({ createdAt: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Document.countDocuments(filter),
        ]);

        return NextResponse.json({
            success: true,
            data: {
                documents: documents.map((doc) => ({
                    id: doc._id.toString(),
                    name: doc.originalName,
                    mimeType: doc.mimeType,
                    size: doc.size,
                    status: doc.status,
                    uploadedBy: doc.uploadedBy.toString(),
                    createdAt: doc.createdAt,
                    updatedAt: doc.updatedAt,
                })),
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        return handleApiError(error);
    }
}

// POST: Upload a document.
export async function POST(request: NextRequest) {
    let storageId: string | null = null;

    try {
        const auth = await requireAuth();

        validateRequestOrigin(request);

        await enforceRateLimit({
            scope: "document-upload",
            identifier: auth.userId,
            limit: 20,
            windowMs: 60 * 60 * 1000,
        });

        let formData: FormData;

        try {
            formData = await request.formData();
        } catch {
            throw new AppError(
                "Invalid multipart form data",
                400,
                "INVALID_MULTIPART_FORM"
            );
        }

        const files = formData.getAll("file");

        if (files.length !== 1 || !(files[0] instanceof File)) {
            throw new AppError(
                "Please upload exactly one file using the file field",
                400,
                "INVALID_UPLOAD"
            );
        }

        const file = files[0];

        const { extension, mimeType } = validateDocumentFile(file);

        const buffer = Buffer.from(await file.arrayBuffer());

        validateFileContent(buffer, extension);

        const sha256 = calculateFileHash(buffer);

        await connectToDatabase();

        // Ensure the unique index exists before relying on it.
        await Document.init();

        const existingDocument = await Document.findOne({
            organizationId: auth.organizationId,
            sha256,
        }).select("_id originalName status");

        if (existingDocument) {
            throw new AppError(
                "This document has already been uploaded to your organization",
                409,
                "DUPLICATE_DOCUMENT"
            );
        }

        const safeFilename = sanitizeFilename(file.name);

        storageId = await storeFile({
            buffer,
            filename: safeFilename,
            contentType: mimeType,
            organizationId: auth.organizationId,
            uploadedBy: auth.userId,
        });

        try {
            const document = await Document.create({
                organizationId: auth.organizationId,
                uploadedBy: auth.userId,
                originalName: safeFilename,
                mimeType,
                size: buffer.length,
                sha256,
                storageId,
                status: "uploaded",
            });
            try {
                await IngestionJob.create({
                    documentId: document._id,
                    organizationId: auth.organizationId,
                    status: "queued",
                    availableAt: new Date(),
                });

                document.status = "queued";
                await document.save();
            } catch (error) {
                await Document.deleteOne({
                    _id: document._id,
                    organizationId: auth.organizationId,
                });

                throw error;
            }

            logger.info("Document uploaded", {
                documentId: document._id.toString(),
                organizationId: auth.organizationId,
                uploadedBy: auth.userId,
            });

            return NextResponse.json(
                {
                    success: true,
                    message: "Document uploaded successfully",
                    data: {
                        id: document._id.toString(),
                        name: document.originalName,
                        size: document.size,
                        mimeType: document.mimeType,
                        status: document.status,
                    },
                },
                { status: 201 }
            );
        } catch (error) {
            if (isDuplicateKeyError(error)) {
                throw new AppError(
                    "This document has already been uploaded to your organization",
                    409,
                    "DUPLICATE_DOCUMENT"
                );
            }

            throw error;
        }
    } catch (error) {
        // Compensating cleanup: avoid leaving a GridFS file without metadata.
        if (storageId) {
            try {
                await deleteStoredFile(storageId);
            } catch (cleanupError) {
                logger.error("Failed to clean up uploaded file", {
                    storageId,
                    error:
                        cleanupError instanceof Error
                            ? cleanupError.message
                            : "Unknown error",
                });
            }
        }

        return handleApiError(error);
    }
}