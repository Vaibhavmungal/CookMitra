const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      // Optional for Google sign-in accounts (no phone from Google profile).
      // Still required for email/password registration via route validation.
      default: "",
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      // Not required for Google-only accounts (they authenticate via ID token).
      // Email/password registration still enforces this via route validation.
      required: function () {
        return !this.googleId;
      },
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ["customer", "cook", "admin"],
      default: "customer",
    },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    avatar: {
      type: String,
      trim: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "local+google"],
      default: "local",
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password || !candidatePassword) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
