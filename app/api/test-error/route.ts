import { AppError, handleApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    logger.info("Testing centralized error handling");

    throw new AppError(
      "Test resource not found",
      404,
      "RESOURCE_NOT_FOUND"
    );
  } catch (error) {
    return handleApiError(error);
  }
}