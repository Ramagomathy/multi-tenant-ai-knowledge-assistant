// import "server-only";

import mongoose, { Schema } from "mongoose";

const OrganizationSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    slug: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      required: true,
    },

    monthlyTokenLimit: {
      type: Number,
      default: 100000,
      min: 0,
    },

    knowledgeVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Organization =
  mongoose.models.Organization ||
  mongoose.model("Organization", OrganizationSchema);

export default Organization;