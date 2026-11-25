import "server-only";

import bcrypt from "bcryptjs";

import { AppError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/db/mongoose";
import { User } from "@/modules/users/models/User";

import type { AuthContext } from "../types/auth.types";
import type { CreateMemberInput } from "../validation/create-member.schema";

export async function createOrganizationMember(
  input: CreateMemberInput,
  auth: AuthContext
) {
  await connectToDatabase();

  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: "member",
      organizationId: auth.organizationId,
      status: "active",
    });

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId.toString(),
    };
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new AppError(
        "An account with this email already exists",
        409,
        "EMAIL_ALREADY_EXISTS"
      );
    }

    throw error;
  }
}