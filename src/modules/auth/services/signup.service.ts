// import "server-only";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import { Organization } from "@/modules/organizations/models/Organization";
import { User } from "@/modules/users/models/User";
import { AppError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { SignupInput } from "../validation/signup.schema";

function createSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function signupUser(input: SignupInput) {
  await connectToDatabase();

  const session = await mongoose.startSession();

  // Hash before opening the transaction so the transaction
  // remains short and holds database resources for less time.
  const passwordHash = await bcrypt.hash(input.password, 12);

  const slug = createSlug(input.organizationName);

  if (!slug) {
    throw new AppError(
      "Please provide a valid organization name",
      400,
      "INVALID_ORGANIZATION_NAME"
    );
  }

    try {
    const createdUser = await session.withTransaction(async () => {
      const [organization] = await Organization.create(
        [
          {
            name: input.organizationName,
            slug,
            status: "active",
          },
        ],
        { session }
      );

      const [user] = await User.create(
        [
          {
            name: input.name,
            email: input.email,
            passwordHash,
            role: "admin",
            organizationId: organization._id,
            status: "active",
          },
        ],
        { session }
      );

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: organization._id.toString(),
      };
    });

    if (!createdUser) {
      throw new Error("Signup transaction did not create a user");
    }

    return createdUser;
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      throw new AppError(
        "An account or organization with these details already exists",
        409,
        "SIGNUP_CONFLICT"
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
}