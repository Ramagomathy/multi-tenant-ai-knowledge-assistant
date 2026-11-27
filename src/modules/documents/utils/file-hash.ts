// import "server-only";

import { createHash } from "node:crypto";

export function calculateFileHash(buffer: Buffer): string {
  return createHash("sha256")
    .update(buffer)
    .digest("hex");
}