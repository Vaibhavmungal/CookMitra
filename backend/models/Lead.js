const mongoose = require("mongoose");

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 80,
    },
    whatsapp: {
      type: String,
      required: [true, "WhatsApp number is required"],
      trim: true,
      match: [/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
      maxlength: 120,
    },
    coords: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
    },
    status: {
      type: String,
      enum: ["new", "contacted", "converted", "closed"],
      default: "new",
    },
  },
  { timestamps: true }
);

leadSchema.index({ whatsapp: 1, createdAt: -1 });

module.exports = mongoose.model("Lead", leadSchema);
