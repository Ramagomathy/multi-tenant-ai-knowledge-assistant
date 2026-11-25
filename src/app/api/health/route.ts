import { NextResponse } from "next/server";
import mongoose from "mongoose";

import { connectToDatabase } from "@/lib/db/mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();

    const database = mongoose.connection.db;

    if (!database) {
      throw new Error("Database connection unavailable");
    }

    await database.admin().ping();

    return NextResponse.json({
      status: "healthy",
      services: {
        database: "connected",
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "unhealthy",
        services: {
          database: "unavailable",
        },
      },
      { status: 503 }
    );
  }
}