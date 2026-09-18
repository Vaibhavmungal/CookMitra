const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const CookProfile = require("../models/CookProfile");
const Review = require("../models/Review");

// Public marketing stats for the homepage hero.
//
// Why this exists: the hero previously hardcoded "100+ cooks / 4.9 rating /
// 10+ cities", which is a CCPA 2022 misleading-ad exposure for a payment
// merchant. These numbers are computed live from the database so the site
// can never drift from reality again. Cached in memory for 5 minutes —
// the counts change slowly and this endpoint is hit on every homepage load.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, payload: null };

router.get("/", async (_req, res, next) => {
  try {
    if (cache.payload && Date.now() - cache.at < CACHE_TTL_MS) {
      return res.json(cache.payload);
    }

    const [approvedCooks, completedBookings, ratingAgg] = await Promise.all([
      CookProfile.countDocuments({ approvalStatus: "approved" }),
      // Completed services, or hours actually worked — both mean a family
      // was served.
      Booking.countDocuments({
        $or: [{ status: "completed" }, { hoursCompleted: true }],
      }),
      Review.aggregate([
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
    ]);

    // Distinct service areas among approved cooks, e.g. "Baner, Kothrud".
    // Capped so the string stays short; empty when no cook lists an area.
    const areas = await CookProfile.distinct("serviceArea", {
      approvalStatus: "approved",
      serviceArea: { $ne: "" },
    });
    const cities = areas
      .map((a) => String(a || "").split(",")[0].trim())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 8);

    const rating = ratingAgg[0] || { avg: null, count: 0 };

    // The frontend hides any stat below its display threshold, so the page
    // shows "growing in Pune" instead of "0 cooks" on day one and real
    // numbers the moment they are meaningful.
    const payload = {
      cooks: approvedCooks,
      bookings: completedBookings,
      ratingAverage:
        rating.count > 0 ? Math.round(Number(rating.avg) * 10) / 10 : null,
      ratingCount: rating.count,
      cities,
      updatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), payload };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
