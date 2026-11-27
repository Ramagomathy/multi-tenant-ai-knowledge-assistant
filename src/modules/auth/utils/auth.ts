// import "server-only";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/db/mongoose";
import { User } from "@/modules/users/models/User";
import { Organization } from "@/modules/organizations/models/Organization";

import type {
  AuthContext,
  UserRole,
} from "../types/auth.types";

const COOKIE_NAME = "session";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function requireAuth(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    throw new AppError(
      "Authentication required",
      401,
      "UNAUTHENTICATED"
    );
  }

  let payload;

  try {
    const result = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      issuer: "knowledge-assistant",
      audience: "knowledge-assistant-app",
    });

    payload = result.payload;
  } catch {
    throw new AppError(
      "Invalid or expired session",
      401,
      "INVALID_SESSION"
    );
  }

  const userId = payload.sub;
  const tokenOrganizationId = payload.organizationId;

  if (
    !userId ||
    typeof tokenOrganizationId !== "string"
  ) {
    throw new AppError(
      "Invalid session",
      401,
      "INVALID_SESSION"
    );
  }

  await connectToDatabase();

  // Always load the current user from the database.
  // This ensures disabled accounts and changed roles take effect.
  const user = await User.findById(userId).select(
    "_id organizationId role status"
  );

  if (!user || user.status !== "active") {
    throw new AppError(
      "Account is unavailable",
      401,
      "ACCOUNT_UNAVAILABLE"
    );
  }

  const organizationId = user.organizationId.toString();

  // Reject sessions whose organization no longer matches the user.
  if (organizationId !== tokenOrganizationId) {
    throw new AppError(
      "Invalid session organization",
      401,
      "INVALID_SESSION"
    );
  }

  const organization = await Organization.findById(
    user.organizationId
  ).select("status");

  if (!organization || organization.status !== "active") {
    throw new AppError(
      "Organization is unavailable",
      403,
      "ORGANIZATION_UNAVAILABLE"
    );
  }

  if (user.role !== "admin" && user.role !== "member") {
    throw new AppError(
      "Invalid account role",
      403,
      "INVALID_ROLE"
    );
  }

  return {
    userId: user._id.toString(),
    organizationId,
    role: user.role as UserRole,
  };
  
}
export async function requireRole(
  ...allowedRoles: UserRole[]
): Promise<AuthContext> {
  const auth = await requireAuth();

  if (!allowedRoles.includes(auth.role)) {
    throw new AppError(
      "You do not have permission to perform this action",
      403,
      "FORBIDDEN"
    );
  }

  return auth;
}