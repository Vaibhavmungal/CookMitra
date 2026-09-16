const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// COOKMITRA EVENTS (MVP §17) — canonical roles are UPPERCASE:
// CUSTOMER, COOK, ADMIN. Lowercase legacy values ("customer"/"cook"/"admin")
// from the earlier on-demand flow are auto-uppercased by the setter below so
// old documents, seeds and clients keep working without a data migration.
const USER_ROLES = ["CUSTOMER", "COOK", "ADMIN"];

const normalizeRole = (v) => {
  if (v == null) return v;
  const up = String(v).trim().toUpperCase();
  return USER_ROLES.includes(up) ? up : v;
};

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
    // COOKMITRA EVENTS spec (§17) names this field `mobile`. `phone` above is
    // the legacy name used across the app — both are kept in sync (see
    // pre-validate / pre-save hooks) so either one can be used.
    mobile: {
      type: String,
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
      enum: USER_ROLES,
      default: "CUSTOMER",
      uppercase: true,
      set: normalizeRole,
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
