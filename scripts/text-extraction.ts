import fs from "node:fs/promises";

import { extractDocumentText } from "../src/modules/ingestion/services/text-extraction.service";

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error("Provide a document file path");
  }

  const buffer = await fs.readFile(filePath);

  const extension = filePath.split(".").pop()?.toLowerCase();

  const mimeType =
    extension === "pdf"
      ? "application/pdf"
      : extension === "md"
        ? "text/markdown"
        : extension === "txt"
          ? "text/plain"
          : "";

  const result = await extractDocumentText(buffer, mimeType);

  console.log({
    pageCount: result.pageCount,
    characterCount: result.characterCount,
    preview: result.text.slice(0, 500),
  });
}

main().catch((error) => {
  console.error("Extraction test failed:", error);
  process.exitCode = 1;
});