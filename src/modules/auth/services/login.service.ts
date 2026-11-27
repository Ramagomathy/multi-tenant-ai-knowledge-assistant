// import "server-only";

import bcrypt from "bcryptjs";
import { SignJWT } from "jose";

import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/db/mongoose";
import { Organization } from "@/modules/organizations/models/Organization";
import { User } from "@/modules/users/models/User";

import type { LoginInput } from "../validation/login.schema";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function loginUser(input: LoginInput) {
  await connectToDatabase();

  const user = await User.findOne({
    email: input.email,
  }).select("+passwordHash");

  // Use the same public error for an unknown email and wrong password.
  if (!user) {
    throw new AppError(
      "Invalid email or password",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const passwordMatches = await bcrypt.compare(
    input.password,
    user.passwordHash
  );

  if (!passwordMatches) {
    throw new AppError(
      "Invalid email or password",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  if (user.status !== "active") {
    throw new AppError(
      "This account is disabled",
      403,
      "ACCOUNT_DISABLED"
    );
  }

  const organization = await Organization.findById(
    user.organizationId
  ).select("status");

  if (!organization || organization.status !== "active") {
    throw new AppError(
      "This organization is unavailable",
      403,
      "ORGANIZATION_UNAVAILABLE"
    );
  }

  const token = await new SignJWT({
    organizationId: user.organizationId.toString(),
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user._id.toString())
    .setIssuer("knowledge-assistant")
    .setAudience("knowledge-assistant-app")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  user.lastLoginAt = new Date();
  await user.save();

  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId.toString(),
    },
  };
}