import { NextRequest, NextResponse } from "next/server";

import { loginSchema } from "@/modules/auth/validation/login.schema";
import { loginUser } from "@/modules/auth/services/login.service";
import { handleApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/modules/security/services/rate-limit.service";
import { getClientIp } from "@/modules/security/utils/client-ip";

// export const runtime = "nodejs";

const COOKIE_NAME = "session";
const SESSION_DURATION = 60 * 60;

export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit({
      scope: "login-ip",
      identifier: getClientIp(request),
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    const body: unknown = await request.json();
    const input = loginSchema.parse(body);

    await enforceRateLimit({
      scope: "login-email",
      identifier: input.email,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    });
    

    const result = await loginUser(input);

    const response = NextResponse.json({
      success: true,
      message: "Login successful",
      data: {
        user: result.user,
      },
    });

    response.cookies.set({
      name: COOKIE_NAME,
      value: result.token,
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION,
    });

    logger.info("User login successful", {
      userId: result.user.id,
      organizationId: result.user.organizationId,
    });

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}