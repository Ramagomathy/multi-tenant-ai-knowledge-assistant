import { NextRequest, NextResponse } from "next/server";

import { signupSchema } from "@/modules/auth/validation/signup.schema";
import { signupUser } from "@/modules/auth/services/signup.service";
import { handleApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/modules/security/services/rate-limit.service";
import { getClientIp } from "@/modules/security/utils/client-ip";

// export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit({
      scope: "signup-ip",
      identifier: getClientIp(request),
      limit: 3,
      windowMs: 60 * 60 * 1000,
    });

    const body: unknown = await request.json();

    const input = signupSchema.parse(body);

    const user = await signupUser(input);

    logger.info("User signup successful", {
      userId: user.id,
      organizationId: user.organizationId,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Organization and administrator created successfully",
        data: {
          user,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}