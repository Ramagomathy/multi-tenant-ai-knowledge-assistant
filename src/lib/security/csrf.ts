import "server-only";

import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const allowedOrigin = new URL(env.APP_ORIGIN).origin;

export function validateRequestOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    throw new AppError(
      "Request origin is missing",
      403,
      "CSRF_ORIGIN_MISSING"
    );
  }

  let requestOrigin: string;

  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    throw new AppError(
      "Invalid request origin",
      403,
      "CSRF_INVALID_ORIGIN"
    );
  }

  if (requestOrigin !== allowedOrigin) {
    throw new AppError(
      "Request origin is not allowed",
      403,
      "CSRF_ORIGIN_MISMATCH"
    );
  }

  const fetchSite = request.headers.get("sec-fetch-site");

  if (fetchSite === "cross-site") {
    throw new AppError(
      "Cross-site requests are not allowed",
      403,
      "CSRF_CROSS_SITE"
    );
  }
}