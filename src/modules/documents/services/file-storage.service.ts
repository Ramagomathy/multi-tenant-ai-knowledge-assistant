import "server-only";

import mongoose from "mongoose";
import { GridFSBucket, ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/db/mongoose";

let bucket: GridFSBucket | null = null;

async function getBucket() {
  await connectToDatabase();

  if (!mongoose.connection.db) {
    throw new Error("MongoDB database is unavailable");
  }

  if (!bucket) {
    bucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: "documents",
    });
  }

  return bucket;
}

interface StoreFileInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
  organizationId: string;
  uploadedBy: string;
}

export async function storeFile(input: StoreFileInput) {
  const gridFS = await getBucket();

  const storageId = new ObjectId();

  return new Promise<string>((resolve, reject) => {
    const uploadStream = gridFS.openUploadStreamWithId(
      storageId,
      input.filename,
      {
        contentType: input.contentType,
        metadata: {
          organizationId: input.organizationId,
          uploadedBy: input.uploadedBy,
        },
      }
    );

    uploadStream.on("error", reject);

    uploadStream.on("finish", () => {
      resolve(storageId.toString());
    });

    uploadStream.end(input.buffer);
  });
}

export async function deleteStoredFile(storageId: string) {
  const gridFS = await getBucket();
  const id = new ObjectId(storageId);

  // Make deletion idempotent if the file is already missing.
  const exists = await gridFS.find({ _id: id }).hasNext();

  if (exists) {
    await gridFS.delete(id);
  }
}