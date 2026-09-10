const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "booking_request",
        "booking_accepted",
        "booking_rejected",
        "booking_confirmed",
        "booking_completed",
        "booking_expired",
        "booking_cancelled",
        "booking_rescheduled",
        "service_started",
        "cook_arrived",
        "cooking_hours_completed",
        "review_received",
        "service_started",
        "profile_approved",
        "profile_rejected",
        "general",
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
