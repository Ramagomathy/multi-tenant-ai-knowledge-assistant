import mongoose, { Schema } from "mongoose";

const OrganizationQuotaSchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },

    periodKey: {
      type: String,
      required: true,
    },

    monthlyLimitTokens: {
      type: Number,
      required: true,
      min: 0,
    },

    usedTokens: {
      type: Number,
      default: 0,
      min: 0,
    },

    reservedTokens: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

OrganizationQuotaSchema.index(
  { organizationId: 1, periodKey: 1 },
  { unique: true, name: "uniq_org_quota_period" }
);

export default mongoose.models.OrganizationQuota ||
  mongoose.model("OrganizationQuota", OrganizationQuotaSchema);