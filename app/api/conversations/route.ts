import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/modules/auth/utils/auth";
import { validateRequestOrigin } from "@/lib/security/csrf";
import { handleApiError } from "@/lib/errors";
import { toObjectId } from "@/lib/mongodb/object-id";

import {
  createConversation,
  listConversations,
} from "@/modules/chat/services/conversation.service";
import { createConversationSchema } from "@/modules/chat/schemas/chat.schema";

export async function GET() {
  try {
    const auth = await requireAuth();
    const conversations = await listConversations({
      organizationId: toObjectId(auth.organizationId),
      userId: toObjectId(auth.userId),
    });

    return NextResponse.json({ success: true, data: conversations });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    validateRequestOrigin(request);
    const auth = await requireAuth();
    const body: unknown = await request.json();
    const input = createConversationSchema.parse(body);

    const conversation = await createConversation({
      organizationId: toObjectId(auth.organizationId),
      userId: toObjectId(auth.userId),
      title: input.title,
    });

    return NextResponse.json(
      { success: true, data: conversation },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
