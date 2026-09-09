const Review = require("../models/Review");
const Booking = require("../models/Booking");
const CookProfile = require("../models/CookProfile");

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
    if (booking.status !== "completed") {
      return res.status(400).json({ message: "Can only review completed bookings" });
    }

    const existingReview = await Review.findOne({ booking: bookingId });
    if (existingReview) {
      return res.status(400).json({ message: "Review already exists" });
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
    const reviews = await Review.find({ cook: cookId })
      .populate("customer", "name")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

exports.getMyReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ customer: req.user.id })
      .populate("cook", "name")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
};

// Reviews received by the logged-in cook (one per completed service).
exports.getCookOwnReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ cook: req.user.id })
      .populate("customer", "name")
      .populate("booking", "date serviceType startTime endTime")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
};
