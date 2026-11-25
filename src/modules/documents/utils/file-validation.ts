import "server-only";

import { AppError } from "@/lib/errors";
import { env } from "@/lib/env";

const ALLOWED_TYPES = {
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
} as const;

export function validateDocumentFile(file: File) {
  const maxSize = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;

  if (!file.name || file.size === 0) {
    throw new AppError(
      "The uploaded file is empty",
      400,
      "EMPTY_FILE"
    );
  }

  if (file.size > maxSize) {
    throw new AppError(
      "File exceeds the allowed upload size",
      413,
      "FILE_TOO_LARGE"
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || !(extension in ALLOWED_TYPES)) {
    throw new AppError(
      "Only PDF, TXT and Markdown files are supported",
      415,
      "UNSUPPORTED_FILE_TYPE"
    );
  }

  const mimeType =
    ALLOWED_TYPES[extension as keyof typeof ALLOWED_TYPES];

  const acceptedMimeTypes =
    extension === "md"
      ? ["text/markdown", "text/x-markdown", "text/plain"]
      : [mimeType];

  if (file.type && !acceptedMimeTypes.includes(file.type)) {
    throw new AppError(
      "File extension and MIME type do not match",
      415,
      "FILE_TYPE_MISMATCH"
    );
  }

  return { extension, mimeType };
}

export function validateFileContent(
  buffer: Buffer,
  extension: string
) {
  if (extension === "pdf") {
    if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
      throw new AppError(
        "Invalid PDF file content",
        415,
        "INVALID_PDF_CONTENT"
      );
    }

    return;
  }

  // Text files must be valid UTF-8 and must not contain binary null bytes.
  if (buffer.includes(0)) {
    throw new AppError(
      "Binary content is not allowed in text files",
      415,
      "INVALID_TEXT_CONTENT"
    );
  }

  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new AppError(
      "Text files must use valid UTF-8 encoding",
      415,
      "INVALID_TEXT_ENCODING"
    );
  }
}

export function sanitizeFilename(filename: string) {
  const safeName = filename
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();

  if (!safeName || safeName.length > 255) {
    throw new AppError(
      "Invalid filename",
      400,
      "INVALID_FILENAME"
    );
  }

  return safeName;
}