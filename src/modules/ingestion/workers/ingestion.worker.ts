// import "server-only";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";
import { logger } from "@/lib/logger";

import { Document } from "@/modules/documents/models/Documents";
import { IngestionJob } from "../models/IngestionJob";
import { DocumentChunk } from "../models/DocumentChunk";

import { readStoredFile } from "@/modules/documents/services/file-storage.service";
import { extractDocumentText } from "../services/text-extraction.service";
import { chunkText } from "../services/chunking.service";
import { embedChunks } from "../services/batch-embedding.service";
import Organization from "@/modules/organizations/models/Organization";

const WORKER_ID = randomUUID();
const POLL_INTERVAL_MS = 2000;
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_BATCH_SIZE = 5;

let stopping = false;

async function recoverStaleJobs() {
    const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);

    await IngestionJob.updateMany(
        {
            status: "processing",
            lockedAt: { $lt: staleBefore },
            attempts: { $lt: 3 },
        },
        {
            $set: {
                status: "queued",
                lockedAt: null,
                lockedBy: null,
                availableAt: new Date(),
            },
        }
    );
    await Document.updateMany(
        {
            status: "processing",
            _id: {
                $in: await IngestionJob.find({
                    status: "queued",
                }).distinct("documentId"),
            },
        },
        {
            $set: { status: "queued" },
        }
    );

    const exhausted = await IngestionJob.find({
        status: "processing",
        lockedAt: { $lt: staleBefore },
        attempts: { $gte: 3 },
    }).select("_id documentId");

    for (const job of exhausted) {
        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                await IngestionJob.updateOne(
                    { _id: job._id, status: "processing" },
                    {
                        $set: {
                            status: "failed",
                            lockedAt: null,
                            lockedBy: null,
                            lastError: "Worker lease expired after maximum attempts",
                        },
                    },
                    { session }
                );

                await Document.updateOne(
                    { _id: job.documentId },
                    { $set: { status: "failed" } },
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }
    }
}

async function claimJob() {
    const now = new Date();
    const leaseId = randomUUID();

    return IngestionJob.findOneAndUpdate(
        {
            status: "queued",
            availableAt: { $lte: now },
            $expr: { $lt: ["$attempts", "$maxAttempts"] },
        },
        {
            $set: {
                status: "processing",
                lockedAt: now,
                lockedBy: leaseId,
            },
            $inc: { attempts: 1 },
        },
        {
            new: true,
            sort: { availableAt: 1, createdAt: 1 },
        }
    );
}

async function processJob(job: InstanceType<typeof IngestionJob>) {
    const document = await Document.findOne({
        _id: job.documentId,
        organizationId: job.organizationId,
    });

    if (!document) {
        throw new Error("Associated document does not exist");
    }

    const buffer = await readStoredFile(document.storageId.toString());

    const extracted = await extractDocumentText(
        buffer,
        document.mimeType
    );

    const chunks = chunkText(extracted.text);

    if (chunks.length === 0) {
        throw new Error("Document produced no usable chunks");
    }

    const embeddedChunks = await embedChunks(chunks);

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            // Only the worker holding the current lease can finish the job.
            const currentJob = await IngestionJob.findOne({
                _id: job._id,
                status: "processing",
                lockedBy: job.lockedBy,
            }).session(session);

            if (!currentJob) {
                throw new Error("Worker no longer owns this job");
            }

            await DocumentChunk.deleteMany(
                {
                    documentId: document._id,
                    organizationId: job.organizationId,
                },
                { session }
            );

            await DocumentChunk.insertMany(
                embeddedChunks.map((chunk) => ({
                    documentId: document._id,
                    organizationId: job.organizationId,
                    chunkIndex: chunk.chunkIndex,
                    content: chunk.content,
                    tokenCount: chunk.tokenCount,
                    embedding: chunk.embedding,
                    embeddingModel: chunk.embeddingModel,
                })),
                { session }
            );

            await Document.updateOne(
                {
                    _id: document._id,
                    organizationId: job.organizationId,
                },
                {
                    $set: { status: "ready" },
                },
                { session }
            );
            await Organization.updateOne(
  { _id: job.organizationId },
  { $inc: { knowledgeVersion: 1 } }
);

            await IngestionJob.updateOne(
                {
                    _id: job._id,
                    status: "processing",
                    lockedBy: job.lockedBy,
                },
                {
                    $set: {
                        status: "completed",
                        completedAt: new Date(),
                        lockedAt: null,
                        lockedBy: null,
                        lastError: null,
                    },
                },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    logger.info("Document ingestion completed", {
        documentId: document._id.toString(),
        chunkCount: embeddedChunks.length,
        organizationId: job.organizationId.toString(),
    });
}

async function handleJob(job: InstanceType<typeof IngestionJob>): Promise<boolean> {
    try {
        await Document.updateOne(
            {
                _id: job.documentId,
                organizationId: job.organizationId,
            },
            { $set: { status: "processing" } }
        );

        await processJob(job);
        return true;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown ingestion error";

        logger.error("Document ingestion failed", {
            jobId: job._id.toString(),
            attempts: job.attempts,
            error: message,
        });

        const failedPermanently = job.attempts >= job.maxAttempts;

        const backoffMs = Math.min(
            60_000 * 2 ** Math.max(job.attempts - 1, 0),
            15 * 60_000
        );

        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                await IngestionJob.updateOne(
                    {
                        _id: job._id,
                        status: "processing",
                        lockedBy: job.lockedBy,
                    },
                    {
                        $set: {
                            status: failedPermanently ? "failed" : "queued",
                            availableAt: new Date(Date.now() + backoffMs),
                            lockedAt: null,
                            lockedBy: null,
                            lastError: message.slice(0, 1000),
                        },
                    },
                    { session }
                );

                if (failedPermanently) {
                    await Document.updateOne(
                        { _id: job.documentId, organizationId: job.organizationId },
                        { $set: { status: "failed" } },
                        { session }
                    );
                }
            });
        } finally {
            await session.endSession();
        }
        return false;
    }
}

export async function runIngestionBatch(batchSize = 3) {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
        throw new Error(`Ingestion batch size must be between 1 and ${MAX_BATCH_SIZE}`);
    }

    await connectToDatabase();
    await recoverStaleJobs();

    let completed = 0;
    let failed = 0;

    for (let index = 0; index < batchSize; index++) {
        const job = await claimJob();
        if (!job) break;

        if (await handleJob(job)) {
            completed++;
        } else {
            failed++;
        }
    }

    return { completed, failed };
}

export async function startIngestionWorker() {
    await connectToDatabase();

    logger.info("Ingestion worker started", { workerId: WORKER_ID });

    while (!stopping) {
        await recoverStaleJobs();

        const job = await claimJob();

        if (!job) {
            await new Promise((resolve) =>
                setTimeout(resolve, POLL_INTERVAL_MS)
            );
            continue;
        }

        await handleJob(job);
    }

    logger.info("Ingestion worker stopped", { workerId: WORKER_ID });
}

export function stopIngestionWorker() {
    stopping = true;
}