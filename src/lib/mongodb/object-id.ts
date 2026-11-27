import { Types } from "mongoose";

/** Validate an external identifier before using it in MongoDB queries. */
export function toObjectId(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("Invalid MongoDB ObjectId");
  }

  return new Types.ObjectId(id);
}
