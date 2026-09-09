const mongoose = require("mongoose");

// Promo coupons (percent-off) managed by admins and applied at checkout.
// Pricing is always recomputed server-side from these records — the client
// only ever sends the code, never an amount.
const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, "Coupon code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [3, "Code must be at least 3 characters"],
      maxlength: [24, "Code must be at most 24 characters"],
      match: [/^[A-Z0-9]+$/, "Code may only contain letters and numbers"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // Percent off, e.g. 20 = 20% off.
    percent: {
      type: Number,
      required: [true, "Discount percent is required"],
      min: [1, "Percent must be at least 1"],
      max: [100, "Percent cannot exceed 100"],
    },
    // Cap on the rupee discount (null = uncapped).
    maxDiscount: {
      type: Number,
      min: [1, "Max discount must be at least ₹1"],
      default: null,
    },
    // Minimum order value (full fee before discount) to use this coupon.
    minOrder: {
      type: Number,
      min: [0, "Minimum order cannot be negative"],
      default: 0,
    },
    // Total redemptions allowed across all users (null = unlimited).
    usageLimit: {
      type: Number,
      min: [1, "Usage limit must be at least 1"],
      default: null,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Users who already redeemed (enforces perUserLimit).
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Max redemptions per user (null = unlimited).
    perUserLimit: {
      type: Number,
      min: [1, "Per-user limit must be at least 1"],
      default: 1,
    },
    validFrom: {
      type: Date,
      default: null,
    },
    validTo: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

couponSchema.index({ active: 1, validTo: 1 });

module.exports = mongoose.model("Coupon", couponSchema);
