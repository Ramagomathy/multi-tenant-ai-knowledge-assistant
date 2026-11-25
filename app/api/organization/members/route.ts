import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/modules/auth/utils/auth";
import { createMemberSchema } from "@/modules/auth/validation/create-member.schema";
import { createOrganizationMember } from "@/modules/auth/services/create-member.service";
import { handleApiError } from "@/lib/errors";
import { connectToDatabase } from "@/lib/db/mongoose";
import { User } from "@/modules/users/models/User";
import { validateRequestOrigin } from "@/lib/security/csrf";

// export const runtime = "nodejs";

export async function GET() {
  try {
    const auth = await requireRole("admin");

    await connectToDatabase();

    const members = await User.find({
      organizationId: auth.organizationId,
    })
      .select("_id name email role status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        members: members.map((member) => ({
          id: member._id.toString(),
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          createdAt: member.createdAt,
        })),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole("admin");
    validateRequestOrigin(request);

    const body: unknown = await request.json();
    const input = createMemberSchema.parse(body);

    const member = await createOrganizationMember(input, auth);

    return NextResponse.json(
      {
        success: true,
        message: "Member created successfully",
        data: { member },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}