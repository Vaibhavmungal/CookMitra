const Review = require("../models/Review");
const Booking = require("../models/Booking");
const CookProfile = require("../models/CookProfile");
const { paginationParams, applyPagination, sendList } = require("../utils/pagination");

exports.createReview = async (req, res, next) => {
  try {
    const { booking: bookingId, rating, comment } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    // Only services that actually happened can be rated — never requests the
    // cook didn't accept or dead bookings (mirrors the Home prompt filter).
    if (["requested", "rejected", "cancelled", "expired"].includes(booking.status)) {
      return res.status(400).json({ message: "You can rate your cook once the service is complete" });
    }
    // Rateable once service hours are over: completed status, the
    // hours-complete flag, or the session end time has passed (covers legacy
    // bookings without the OTP clock and cooks who forgot to tap complete).
    const sessionEnd = (() => {
      if (booking.serviceEndsAt) {
        const d = new Date(booking.serviceEndsAt);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      if (!booking.date || !booking.endTime) return null;
      const m = String(booking.endTime).match(/^(\d{1,2}):(\d{2})/);
      if (!m) return null;
      const d = new Date(booking.date);
      d.setHours(Number(m[1]), Number(m[2]), 0, 0);
      return d;
    })();
    const serviceHoursEnded =
      booking.status === "completed" ||
      booking.hoursCompleted === true ||
      (sessionEnd ? Date.now() >= sessionEnd.getTime() : false);
    if (!serviceHoursEnded) {
      return res.status(400).json({ message: "You can rate your cook once the service hours are over" });
    }

    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
      return res.status(409).json({ message: "Review already exists" });
    }

    const review = await Review.create({
      booking: bookingId,
      customer: req.user.id,
      cook: booking.cook,
      rating,
      comment,
    });

    const allReviews = await Review.find({ cook: booking.cook });
    const avgRating =
      allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await CookProfile.findOneAndUpdate(
      { user: booking.cook },
      { "rating.average": avgRating, "rating.count": allReviews.length }
    );

    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
};

exports.getCookReviews = async (req, res, next) => {
  try {
    // Callers pass either the cook's User id (Review.cook) or the CookProfile
    // id (e.g. /cooks/:id pages) — resolve profiles to their user first.
    let cookId = req.params.cookId;
    try {
      const profile = await CookProfile.findById(cookId).select("user");
      if (profile?.user) cookId = profile.user.toString();
    } catch {
      // not a profile id — fall through and use the param as a user id
    }
    const filter = { cook: cookId };
    const pg = paginationParams(req);
    const reviews = await applyPagination(
      Review.find(filter).populate("customer", "name").sort({ createdAt: -1 }),
      pg
    );
    return sendList(res, reviews, pg, () => Review.countDocuments(filter));
  } catch (error) {
    next(error);
  }
};

exports.getMyReviews = async (req, res, next) => {
  try {
    const filter = { customer: req.user.id };
    const pg = paginationParams(req);
    const reviews = await applyPagination(
      Review.find(filter).populate("cook", "name").sort({ createdAt: -1 }),
      pg
    );
    return sendList(res, reviews, pg, () => Review.countDocuments(filter));
  } catch (error) {
    next(error);
  }
};

// Reviews received by the logged-in cook (one per completed service).
exports.getCookOwnReviews = async (req, res, next) => {
  try {
    const filter = { cook: req.user.id };
    const pg = paginationParams(req);
    const reviews = await applyPagination(
      Review.find(filter)
        .populate("customer", "name")
        .populate("booking", "date serviceType startTime endTime")
        .sort({ createdAt: -1 }),
      pg
    );
    return sendList(res, reviews, pg, () => Review.countDocuments(filter));
  } catch (error) {
    next(error);
  }
};
