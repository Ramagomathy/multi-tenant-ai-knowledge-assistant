import { NextRequest, NextResponse } from "next/server";

import { Types } from "mongoose";

import { requireAuth } from "@/modules/auth/utils/auth";
import { validateRequestOrigin } from "@/lib/security/csrf";
import { handleApiError } from "@/lib/errors";

import {
  getConversation,
  deleteConversation,
} from "@/modules/chat/services/conversation.service";

interface RouteContext {
  params: { conversationId: string } | Promise<{ conversationId: string }>;
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const auth = await requireAuth();
    const { conversationId } = await context.params;

    if (!Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    const result = await getConversation({
      conversationId,
      organizationId: auth.organizationId,
      userId: auth.userId,
    });

    if (!result) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    validateRequestOrigin(request);

    const auth = await requireAuth();
    const { conversationId } = await context.params;

    if (!Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    await deleteConversation({
      conversationId,
      organizationId: auth.organizationId,
      userId: auth.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "CONVERSATION_NOT_FOUND"
    ) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    return handleApiError(error);
  }
}