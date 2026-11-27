import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { handleApiError } from "@/lib/errors";
import { runIngestionBatch } from "@/modules/ingestion/workers/ingestion.worker";

export async function POST(request: Request) {
  const expectedSecret = env.INGESTION_CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Ingestion cron is not configured" },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization") ?? "";
  const providedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);
  const authorized =
    provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runIngestionBatch();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
