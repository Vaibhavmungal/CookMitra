const CookProfile = require("../models/CookProfile");
const User = require("../models/User");
const {
  getDayWindows,
  getDayBookings,
  computeStartOptions,
  localDayString,
  resolveCookAvailability,
} = require("../utils/slots");

// Fields a cook may set on their own profile. Everything else
// (approvalStatus, rating, user, liveLocation) is admin-managed or updated
// through a dedicated endpoint and must NOT be writable via the generic create/
// update handlers — otherwise a cook could self-approve, inflate their rating,
// or reassign the profile's owner.
const COOK_EDITABLE_FIELDS = [
  "bio",
  "skills",
  "experienceYears",
  "specialties",
  "serviceTypes",
  "rate",
  "serviceArea",
  "address",
  "documents",
  "aadharCardUrl",
  "panCardUrl",
  "photoUrl",
];

const pickCookEditable = (obj) => {
  const out = {};
  for (const key of COOK_EDITABLE_FIELDS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
};

exports.getCooks = async (req, res, next) => {
  try {
    const { serviceType, serviceArea, search, date, durationHours } = req.query;
    const filter = {};

    if (!req.user || req.user.role !== "admin") {
      filter.approvalStatus = "approved";
    }

    if (serviceType) filter.serviceTypes = serviceType;
    if (serviceArea) filter.serviceArea = { $regex: serviceArea, $options: "i" };

    let cooks = await CookProfile.find(filter).populate(
      "user",
      "name email phone status"
    );

    // Hide cooks whose account was blocked or deleted by an admin so they
    // can no longer be discovered or booked by customers. Admins still see
    // everything so they can manage the accounts. Also hide cooks who have
    // toggled themselves "unavailable" (auto-reset the next day).
    if (!req.user || req.user.role !== "admin") {
      const flags = await Promise.all(
        cooks.map(async (cook) => {
          if (cook.user && cook.user.status === "suspended") return false;
          return resolveCookAvailability(cook);
        })
      );
      cooks = cooks.filter((_, i) => flags[i]);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      cooks = cooks.filter(
        (cook) =>
          cook.user?.name?.toLowerCase().includes(searchLower) ||
          cook.specialties?.some((s) => s.toLowerCase().includes(searchLower))
      );
    }

    // Availability filter: hide cooks with nothing bookable on the date.
    // date alone -> at least one open window; date + durationHours -> at
    // least one free start option after subtracting existing bookings.
    if (date) {
      if (Number.isNaN(new Date(date).getTime())) {
        return res.status(400).json({ message: "Invalid date" });
      }
      let dur = null;
      if (durationHours != null && durationHours !== "") {
        dur = Number(durationHours);
        if (!Number.isFinite(dur) || dur < 0.5 || dur > 12) {
          return res.status(400).json({ message: "durationHours must be between 0.5 and 12" });
        }
      }
      const checks = await Promise.all(
        cooks.map(async (cook) => {
          try {
            const windows = await getDayWindows(cook.user._id, date);
            if (!windows.length) return false;
            if (dur == null) return true;
            const bookings = await getDayBookings(cook.user._id, date);
            return computeStartOptions(windows, bookings, dur).length > 0;
          } catch {
            return false;
          }
        })
      );
      cooks = cooks.filter((_, i) => checks[i]);
    }

    res.json(cooks);
  } catch (error) {
    next(error);
  }
};

exports.getCook = async (req, res, next) => {
  try {
    // Accept either a CookProfile id (/cooks/:id pages) or a User id
    // (e.g. dashboard "View Cook Profile" links over populated cooks).
    let cook = null;
    try {
      cook = await CookProfile.findById(req.params.id).populate(
        "user",
        "name email phone"
      );
    } catch {
      cook = null;
    }
    if (!cook) {
      cook = await CookProfile.findOne({ user: req.params.id }).populate(
        "user",
        "name email phone"
      );
    }
    if (!cook) {
      return res.status(404).json({ message: "Cook profile not found" });
    }
    res.json(cook);
  } catch (error) {
    next(error);
  }
};

// Admin-only: full cook dossier — profile + contact/address/documents,
// every booking (customer + service address + hours), and earnings/hours
// summary (total + per service). Accepts a CookProfile id or a User id.
exports.getCookAdminOverview = async (req, res, next) => {
  try {
    let profile = null;
    try {
      profile = await CookProfile.findById(req.params.id).populate(
        "user",
        "name email phone status"
      );
    } catch {
      profile = null;
    }
    if (!profile) {
      profile = await CookProfile.findOne({ user: req.params.id }).populate(
        "user",
        "name email phone status"
      );
    }
    if (!profile) {
      return res.status(404).json({ message: "Cook profile not found" });
    }

    const Booking = require("../models/Booking");
    const bookings = await Booking.find({ cook: profile.user._id })
      .populate("customer", "name email phone")
      .sort({ date: -1 });

    // Customer ratings for each service (one per booking max) + full list.
    let reviews = [];
    let reviewByBookingId = {};
    try {
      const Review = require("../models/Review");
      reviews = await Review.find({ cook: profile.user._id })
        .populate("customer", "name")
        .populate("booking", "date serviceType startTime endTime status")
        .sort({ createdAt: -1 });
      reviewByBookingId = Object.fromEntries(
        reviews.map((r) => [
          r.booking?._id?.toString() || r.booking?.toString(),
          r.toObject ? r.toObject() : r,
        ])
      );
    } catch {
      reviews = [];
      reviewByBookingId = {};
    }
    const bookingsWithReviews = bookings.map((b) => {
      const obj = b.toObject ? b.toObject() : b;
      return { ...obj, review: reviewByBookingId[b._id.toString()] || null };
    });

    // Earnings count ONLY payments with status "paid" AND a received
    // razorpay payment id. Pending amounts (no payment id yet) never count.
    const earnedOf = (b) =>
      b?.payment?.status === "paid" && b?.payment?.razorpayPaymentId
        ? Number(b?.payment?.paidAmount || 0)
        : 0;
    const CURRENT_STATUSES = ["requested", "accepted", "confirmed", "in_progress"];
    const completed = bookings.filter((b) => b.status === "completed");

    const earningsByService = {};
    for (const b of completed) {
      const key = b.serviceType || "unknown";
      if (!earningsByService[key]) {
        earningsByService[key] = { count: 0, earnings: 0, hours: 0 };
      }
      earningsByService[key].count += 1;
      earningsByService[key].earnings += earnedOf(b);
      earningsByService[key].hours += Number(b.durationHours || 0);
    }

    res.json({
      profile,
      bookings: bookingsWithReviews,
      reviews: reviews.map((r) => (r.toObject ? r.toObject() : r)),
      summary: {
        totalBookings: bookings.length,
        completedCount: completed.length,
        currentCount: bookings.filter((b) => CURRENT_STATUSES.includes(b.status)).length,
        totalEarnings: completed.reduce((s, b) => s + earnedOf(b), 0),
        totalHours: completed.reduce((s, b) => s + Number(b.durationHours || 0), 0),
        earningsByService,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.createCookProfile = async (req, res, next) => {
  try {
    const existingProfile = await CookProfile.findOne({ user: req.user.id });
    if (existingProfile) {
      return res.status(400).json({ message: "Cook profile already exists" });
    }

    const body = pickCookEditable(req.body);
    // Keep legacy `bio` and renamed `skills` in sync — old clients send only
    // bio, the new form sends skills.
    if (body.skills != null && body.bio == null) body.bio = body.skills;
    if (body.bio != null && body.skills == null) body.skills = body.bio;
    const profile = await CookProfile.create({
      user: req.user.id,
      // New profiles always start "pending" until an admin approves them —
      // approvalStatus can never come from the request body.
      approvalStatus: "pending",
      ...body,
    });
    res.status(201).json(profile);
  } catch (error) {
    next(error);
  }
};

exports.getMyProfile = async (req, res, next) => {
  try {
    const profile = await CookProfile.findOne({ user: req.user.id }).populate(
      "user",
      "name email phone"
    );
    if (!profile) {
      return res.status(404).json({ message: "Cook profile not found" });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

exports.updateCookProfile = async (req, res, next) => {
  try {
    // Whitelist-only: admin-managed fields (approvalStatus, rating, user) and
    // the GPS liveLocation (dedicated PATCH /me/location endpoint) can never be
    // written through the generic profile editor.
    const body = pickCookEditable(req.body);
    if (body.skills != null && body.bio == null) body.bio = body.skills;
    if (body.bio != null && body.skills == null) body.skills = body.bio;
    const profile = await CookProfile.findOneAndUpdate(
      { user: req.user.id },
      body,
      { new: true, runValidators: true }
    );
    if (!profile) {
      return res.status(404).json({ message: "Cook profile not found" });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

// Cook pins their current GPS location. Stored on the profile and used as the
// "cook's live location" shared to the user's WhatsApp on their bookings.
// Optional `accuracy` (metres) is stored alongside so poor fixes can be flagged.
exports.updateMyLiveLocation = async (req, res, next) => {
  try {
    const { lat, lng, accuracy } = req.body || {};
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ message: "Valid lat/lng are required" });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({ message: "Invalid coordinates" });
    }
    const acc =
      typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100000
        ? Math.round(accuracy)
        : undefined;
    const profile = await CookProfile.findOneAndUpdate(
      { user: req.user.id },
      {
        liveLocation: {
          lat,
          lng,
          ...(acc !== undefined ? { accuracy: acc } : {}),
          updatedAt: new Date(),
        },
      },
      { new: true }
    );
    if (!profile) {
      return res.status(404).json({ message: "Cook profile not found" });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
};

exports.updateApprovalStatus = async (req, res, next) => {
  try {
    const profile = await CookProfile.findByIdAndUpdate(
      req.params.id,
      { approvalStatus: req.body.status },
      { new: true }
    );
    if (!profile) {
      return res.status(404).json({ message: "Cook profile not found" });
    }

    const Notification = require("../models/Notification");
    await Notification.create({
      user: profile.user,
      type: req.body.status === "approved" ? "profile_approved" : "profile_rejected",
      message:
        req.body.status === "approved"
          ? "Your cook profile has been approved!"
          : "Your cook profile has been rejected.",
    });

    res.json(profile);
  } catch (error) {
    next(error);
  }
};

exports.getAvailableSlots = async (req, res, next) => {
  try {
    const Availability = require("../models/Availability");
    const CookProfile = require("../models/CookProfile");
    const { parseDay } = require("../utils/slots");
    const { date } = req.query;

    // Accept either a CookProfile id (/cooks/:id pages) or a User id, consistent
    // with getCook / getCookReviews / getCookAdminOverview. Availability.cook
    // stores the user id, so a bare profile id would otherwise match nothing.
    let cookId = req.params.id;
    let profile = null;
    try {
      profile = await CookProfile.findById(cookId).select("user availabilityStatus unavailableDate");
      if (profile?.user) cookId = profile.user.toString();
    } catch {
      // not a profile id — fall through and use the param as a user id
    }
    if (!profile) {
      profile = await CookProfile.findOne({ user: cookId }).select(
        "availabilityStatus unavailableDate"
      );
    }

    // A cook who has toggled "unavailable" exposes no bookable slots until they
    // become available again on their own OR the next day begins.
    if (profile && !(await resolveCookAvailability(profile))) {
      return res.json([]);
    }

    const filter = { cook: cookId, status: "available" };
    if (date) {
      // Match the same LOCAL-midnight day range the booking slot engine uses
      // (parseDay + dayBounds), instead of new Date("YYYY-MM-DD") which is UTC
      // midnight and lands on the wrong local day on non-UTC servers.
      const start = parseDay(date);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const slots = await Availability.find(filter).sort({ date: 1, startTime: 1 });
    res.json(slots);
  } catch (error) {
    next(error);
  }
};

// Cook uploads ID verification files (Aadhaar / PAN / photo).
// Expects multipart/form-data with fields: aadhar, pan, photo (each max 1).
// Returns relative URLs { aadharCardUrl, panCardUrl, photoUrl } which the
// client then saves via POST / PUT cook profile.
exports.uploadCookDocs = async (req, res, next) => {
  try {
    const urls = {};
    if (req.files?.aadhar?.[0]) {
      urls.aadharCardUrl = `/uploads/cook-docs/${req.files.aadhar[0].filename}`;
    }
    if (req.files?.pan?.[0]) {
      urls.panCardUrl = `/uploads/cook-docs/${req.files.pan[0].filename}`;
    }
    if (req.files?.photo?.[0]) {
      urls.photoUrl = `/uploads/cook-docs/${req.files.photo[0].filename}`;
    }
    if (!Object.keys(urls).length) {
      return res.status(400).json({ message: "No files uploaded" });
    }
    res.json(urls);
  } catch (error) {
    next(error);
  }
};

// Cook toggles themselves between "available" and "unavailable". While
// unavailable they are hidden from all booking until they toggle back OR the
// next day begins (auto reset handled by resolveCookAvailability on read).
exports.toggleAvailability = async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (status !== "available" && status !== "unavailable") {
      return res.status(400).json({ message: "Status must be 'available' or 'unavailable'" });
    }

    const profile = await CookProfile.findOneAndUpdate(
      { user: req.user.id },
      {
        availabilityStatus: status,
        // Record the local day we went unavailable so the next-day auto reset
        // has an expiry to compare against.
        unavailableDate: status === "unavailable" ? localDayString() : "",
      },
      { new: true }
    );
    if (!profile) {
      return res.status(404).json({ message: "Cook profile not found" });
    }
    res.json(profile);
  } catch (error) {
    next(error);
  }
};