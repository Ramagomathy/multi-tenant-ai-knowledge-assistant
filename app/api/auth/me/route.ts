import { NextResponse } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { handleApiError } from "@/lib/errors";

// export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireAuth();

    return NextResponse.json({
      success: true,
      data: {
        userId: auth.userId,
        organizationId: auth.organizationId,
        role: auth.role,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}