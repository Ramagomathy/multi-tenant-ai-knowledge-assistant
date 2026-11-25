import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";

import { requireAuth } from "@/modules/auth/utils/auth";
import { validateRequestOrigin } from "@/lib/security/csrf";

import { connectToDatabase } from "@/lib/db/mongoose";
import { AppError, handleApiError } from "@/lib/errors";

import { Document } from "@/modules/documents/models/Documents";
import { deleteStoredFile } from "@/modules/documents/services/file-storage.service";

// export const runtime = "nodejs";

interface RouteContext {
    params: Promise<{ documentId: string }>;
}

export async function DELETE(
    request: NextRequest,
    context: RouteContext
) {
    try {
        const auth = await requireAuth();

        validateRequestOrigin(request);

        const { documentId } = await context.params;

        if (!/^[a-fA-F0-9]{24}$/.test(documentId)) {
            throw new AppError(
                "Invalid document ID",
                400,
                "INVALID_DOCUMENT_ID"
            );
        }

        await connectToDatabase();

        const permissionFilter =
            auth.role === "admin"
                ? {}
                : { uploadedBy: new mongoose.Types.ObjectId(auth.userId) };

        // Mark the document as deleting before removing its file.
        const document = await Document.findOne({
            _id: documentId,
            organizationId: auth.organizationId,
            status: { $ne: "deleting" },
            ...permissionFilter,
        });

        if (!document) {
            throw new AppError("Document not found", 404, "DOCUMENT_NOT_FOUND");
        }

        const previousStatus = document.status;

        document.status = "deleting";
        await document.save();

        try {
            await deleteStoredFile(document.storageId.toString());
        } catch {
            document.status = previousStatus;
            await document.save();

            throw new AppError(
                "Unable to delete document storage. Please retry.",
                503,
                "DOCUMENT_DELETE_FAILED"
            );
        }

        await Document.deleteOne({
            _id: document._id,
            organizationId: auth.organizationId,
            status: "deleting",
        });
        return NextResponse.json({
            success: true,
            message: "Document deleted successfully",
        });
    } catch (error) {
        return handleApiError(error);
    }
}