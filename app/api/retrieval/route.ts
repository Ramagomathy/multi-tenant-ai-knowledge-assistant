import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { retrievalSchema } from "@/modules/retrieval/schemas/retrieval.schema";
import { retrieveDocuments } from "@/modules/retrieval/services/retrieval.service";
import { toObjectId } from "@/lib/mongodb/object-id";

import { validateRequestOrigin } from "@/lib/security/csrf";
import { handleApiError } from "@/lib/errors";

export async function POST(request: NextRequest) {
  try {
    validateRequestOrigin(request);
    const auth = await requireAuth();
    const body = await request.json();
    const input = retrievalSchema.parse(body);

    const result = await retrieveDocuments({
      organizationId: toObjectId(auth.organizationId),
      query: input.query,
      topK: input.topK,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
