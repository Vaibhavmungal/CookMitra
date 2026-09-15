const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const toUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  address: user.address,
  role: user.role,
  status: user.status,
  avatar: user.avatar,
  authProvider: user.authProvider,
});

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );
};

// Greet a brand-new website member with an in-app notification. Best-effort:
// a notification failure must never block signup, so errors are swallowed.
const sendWelcomeNotification = async (user) => {
  try {
    const Notification = require("../models/Notification");
    const name = String(user?.name || "").trim().split(" ")[0] || "there";
    const isCook = user?.role === "cook";
    await Notification.create({
      user: user._id,
      type: "general",
      message: isCook
        ? `Welcome to Cook Mitra, ${name}! Your cook account is ready — complete your cook profile to start receiving bookings.`
        : `Welcome to Cook Mitra, ${name}! Your account is ready — explore verified cooks and book your first service.`,
    });
  } catch {
    // Intentionally ignored — signup succeeds even if notifications are down.
  }
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const user = await User.create({ name, email, phone, password, role });
    const token = generateToken(user);

    await sendWelcomeNotification(user);

    res.status(201).json({
      token,
      user: toUserPayload(user),
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Google-only accounts have no password — guide them to the right button.
    // (Check googleId so legacy stubs/records without a selected password
    // field are not misclassified.)
    if (!user.password && user.googleId) {
      return res.status(401).json({
        message: "This account uses Google sign-in. Please continue with Google.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Blocked accounts cannot sign in (even with valid credentials).
    if (user.status === "suspended") {
      return res.status(403).json({
        message:
          "Your account has been blocked by an administrator. Please contact support.",
      });
    }

    const token = generateToken(user);

    res.json({
      token,
      user: toUserPayload(user),
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/google — verify a Google Identity Services ID token,
// then sign in or create the matching account and return our own JWT.
// Works for both login and signup: new users are created with the
// requested role (customer/cook), existing emails are linked.
exports.googleAuth = async (req, res, next) => {
  try {
    const { idToken, role } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID token is required" });
    }
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({
        message: "Google sign-in is not configured on the server (GOOGLE_CLIENT_ID missing)",
      });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      return res.status(401).json({ message: "Invalid Google token. Please try again." });
    }

    const googleId = payload?.sub;
    const email = payload?.email?.toLowerCase?.();
    const emailVerified = payload?.email_verified;
    const name = payload?.name || email?.split("@")[0] || "Google User";
    const avatar = payload?.picture;

    if (!googleId || !email) {
      return res.status(401).json({ message: "Google account did not return an email" });
    }
    if (emailVerified === false) {
      return res.status(401).json({ message: "Google email is not verified" });
    }

    // 1) Returning Google user.
    let user = await User.findOne({ googleId });
    let isNewGoogleUser = false;
    if (!user) {
      // 2) Existing email/password account — link Google for future logins.
      user = await User.findOne({ email });
      if (user) {
        if (user.status === "suspended") {
          return res.status(403).json({
            message:
              "Your account has been blocked by an administrator. Please contact support.",
          });
        }
        user.googleId = user.googleId || googleId;
        if (avatar && !user.avatar) user.avatar = avatar;
        user.authProvider = user.password ? "local+google" : "google";
        await user.save();
      } else {
        // 3) Brand-new user — role comes from the signup role selector,
        // defaulting to customer. Never allow privilege escalation to admin.
        const safeRole = role === "cook" ? "cook" : "customer";
        user = await User.create({
          name: String(name).slice(0, 80),
          email,
          googleId,
          avatar,
          authProvider: "google",
          role: safeRole,
        });
        isNewGoogleUser = true;
      }
    } else if (user.status === "suspended") {
      return res.status(403).json({
        message:
          "Your account has been blocked by an administrator. Please contact support.",
      });
    } else {
      // Keep profile fresh on repeat logins.
      let changed = false;
      if (avatar && user.avatar !== avatar) {
        user.avatar = avatar;
        changed = true;
      }
      if (name && user.name !== name && !user.name) {
        user.name = name;
        changed = true;
      }
      if (changed) await user.save();
    }

    if (isNewGoogleUser) {
      await sendWelcomeNotification(user);
    }

    const token = generateToken(user);
    res.json({ token, user: toUserPayload(user) });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(toUserPayload(user));
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, address } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, phone, address },
      { new: true, runValidators: true }
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(toUserPayload(user));
  } catch (error) {
    next(error);
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// Admin: create a cook account (User + approved CookProfile) in one step.
// The created cook can sign in with the given credentials and is immediately
// bookable (no admin approval step needed).
exports.adminAddCook = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      rate,
      serviceArea,
      specialties,
      serviceTypes,
    } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }

    const user = await User.create({ name, email, phone, password, role: "cook" });

    // Build the cook profile. Everything is admin-provided, so start the cook
    // as approved and immediately bookable.
    const profileData = {
      user: user._id,
      approvalStatus: "approved",
      rate: Number(rate) || 500,
      serviceArea: serviceArea || "",
      specialties: Array.isArray(specialties)
        ? specialties.map((s) => String(s).trim()).filter(Boolean)
        : [],
      serviceTypes: Array.isArray(serviceTypes) && serviceTypes.length
        ? serviceTypes.filter((t) =>
            ["cook_for_me", "cook_with_me", "teach_me", "preparation_help"].includes(t)
          )
        : ["cook_with_me"],
    };

    const CookProfile = require("../models/CookProfile");
    const profile = await CookProfile.create(profileData);

    // Welcome notification so the new cook knows their account is ready.
    const Notification = require("../models/Notification");
    await Notification.create({
      user: user._id,
      type: "general",
      message: "Welcome to Cook Mitra! Your chef account is approved and ready for bookings.",
    });

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      profile,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: register a new admin account. Only an existing logged-in admin can
// use this (route is auth + authorize("admin")) — the public /register and
// Google flows can never create admins, so there is no privilege-escalation
// path. Returns the created admin (no token: the creating admin stays signed
// in as themselves; the new admin signs in via /login afterwards).
exports.adminAddAdmin = async (req, res, next) => {
  try {
    const { name, email, phone, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }

    const user = await User.create({ name, email, phone, password, role: "admin" });

    const Notification = require("../models/Notification");
    await Notification.create({
      user: user._id,
      type: "general",
      message: "Welcome to Cook Mitra! Your admin account is ready — sign in to open the Admin Control Panel.",
    });

    res.status(201).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Shared guardrails for admin account management: admins can manage
// customer and cook accounts, but never themselves or fellow admins.
const assertManageableAccount = (req, res, target) => {
  if (String(target._id) === String(req.user.id)) {
    res.status(400).json({ message: "You cannot manage your own account" });
    return false;
  }
  if (target.role === "admin") {
    res.status(403).json({ message: "Admin accounts cannot be blocked or deleted" });
    return false;
  }
  return true;
};

// Admin: block (suspend) or unblock a customer/cook account. Blocked users
// are rejected at login and their existing tokens stop working immediately.
exports.adminSetUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["active", "suspended"].includes(status)) {
      return res
        .status(400)
        .json({ message: "Status must be either active or suspended" });
    }

    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!assertManageableAccount(req, res, target)) return;

    target.status = status;
    await target.save();

    const Notification = require("../models/Notification");
    await Notification.create({
      user: target._id,
      type: "general",
      message:
        status === "suspended"
          ? "Your account has been blocked by an administrator. Please contact support."
          : "Your account has been unblocked. Welcome back!",
    });

    res.json({
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
      status: target.status,
    });
  } catch (error) {
    next(error);
  }
};

// Admin: permanently delete a customer/cook account along with the data it
// owns (cook profile, availability slots, notifications, reviews, bookings).
exports.adminDeleteUser = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!assertManageableAccount(req, res, target)) return;

    const CookProfile = require("../models/CookProfile");
    const Availability = require("../models/Availability");
    const Booking = require("../models/Booking");
    const Review = require("../models/Review");
    const Notification = require("../models/Notification");

    // Cascade-delete everything owned by or linked to this account so no
    // orphaned records are left behind.
    await CookProfile.deleteMany({ user: target._id });
    await Availability.deleteMany({ cook: target._id });
    await Notification.deleteMany({ user: target._id });
    await Review.deleteMany({ $or: [{ customer: target._id }, { cook: target._id }] });
    await Booking.deleteMany({ $or: [{ customer: target._id }, { cook: target._id }] });

    await target.deleteOne();

    res.json({
      message: `Account for ${target.name} (${target.email}) has been permanently deleted`,
      id: target._id,
    });
  } catch (error) {
    next(error);
  }
};
