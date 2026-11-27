// import "server-only";

import pdfParse from "pdf-parse";

import { AppError } from "@/lib/errors";

interface ExtractionResult {
  text: string;
  pageCount: number | null;
  characterCount: number;
}

const MAX_EXTRACTED_CHARACTERS = 2_000_000;

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  let text = "";
  let pageCount: number | null = null;

  try {
    if (mimeType === "application/pdf") {
      const result = await pdfParse(buffer);

      text = result.text;
      pageCount = result.numpages;
    } else if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown"
    ) {
      text = new TextDecoder("utf-8", {
        fatal: true,
      }).decode(buffer);
    } else {
      throw new AppError(
        "Unsupported document format",
        415,
        "UNSUPPORTED_DOCUMENT_FORMAT"
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(
      "Unable to extract text from this document",
      422,
      "DOCUMENT_EXTRACTION_FAILED"
    );
  }

  const normalizedText = normalizeExtractedText(text);

  if (!normalizedText.trim()) {
    throw new AppError(
      "This document does not contain extractable text",
      422,
      "EMPTY_EXTRACTED_TEXT"
    );
  }

  if (normalizedText.length > MAX_EXTRACTED_CHARACTERS) {
    throw new AppError(
      "Extracted document content exceeds the allowed limit",
      413,
      "EXTRACTED_TEXT_TOO_LARGE"
    );
  }

  return {
    text: normalizedText,
    pageCount,
    characterCount: normalizedText.length,
  };
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}