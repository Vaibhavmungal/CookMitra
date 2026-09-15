const Booking = require("../models/Booking");
const Notification = require("../models/Notification");
const CookProfile = require("../models/CookProfile");
const Coupon = require("../models/Coupon");
const User = require("../models/User");
const { normalizeCode, rejectionReason, computeDiscount } = require("../utils/coupons");
const { slabPriceForDuration, splitPayout } = require("../utils/pricing");
const crypto = require("crypto");
const {
  getDayWindows,
  getDayBookings,
  activeSlotMatch,
  findContainingWindow,
  findOverlapBooking,
  timeToMinutes,
  minutesToTime,
  parseDay,
  localDayString,
  dayBounds,
  intervalsOverlap,
  resolveCookAvailability,
} = require("../utils/slots");
const { buildBookingWhatsAppUrl, buildCustomerWhatsAppUrl, buildCookJobSheetWhatsAppUrl, buildHoursCompleteWhatsAppUrl, buildReviewWhatsAppUrl, buildTrackingUrl, FRONTEND_BASE_URL } = require("../utils/whatsapp");
const { razorpay: razorpayClient, isConfigured: razorpayConfigured } = require("../config/razorpay");

// Cook is considered "reached" within this radius of the venue.
const ARRIVAL_RADIUS_KM = 0.3;

const haversineKm = (a, b) => {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
};

// OTP for starting a service: 4 digits, first digit non-zero so it always
// renders as 4 digits (no leading-zero display issues).
const generateServiceOtp = () =>
  String(1000 + crypto.randomInt(0, 9000));

// End of the service clock. Prefers the live clock (serviceEndsAt, set when
// the cook enters the OTP) over the static schedule (date + endTime) so the
// hours-complete alarm counts from the actual start, not the booking slot.
const sessionEndDate = (booking) => {
  if (booking?.serviceEndsAt) {
    const d = new Date(booking.serviceEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!booking?.date || !booking?.endTime) return null;
  const m = String(booking.endTime).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(booking.date);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
};

// Strip the service OTP from a booking payload before it reaches the cook:
// the cook must ask the customer for the code in person. Applies to a
// Mongoose doc, a lean object, or an array of either.
const stripServiceOtp = (payload) => {
  const stripOne = (b) => {
    if (!b || typeof b !== "object") return b;
    if (typeof b.toObject === "function") {
      const o = b.toObject();
      delete o.serviceOtp;
      return o;
    }
    const { serviceOtp: _omit, ...rest } = b;
    return rest;
  };
  return Array.isArray(payload) ? payload.map(stripOne) : stripOne(payload);
};

// Ensure a booking has a service-start OTP (generated once at creation; back
// filled for older bookings). Returns true when a new OTP was assigned.
// The doc must be saved by the caller afterwards.
const ensureServiceOtp = (booking) => {
  if (booking?.serviceOtp) return false;
  booking.serviceOtp = generateServiceOtp();
  booking.serviceOtpGeneratedAt = new Date();
  return true;
};

// Flag cooking-hours completion. The session clock only runs after the cook
// verifies the service-start OTP (serviceStartedAt → serviceEndsAt); the
// static schedule is only a fallback for bookings started before this
// feature. Creates the alarm notification for BOTH customer and cook.
// Returns true when newly flagged.
const markHoursCompleteIfNeeded = async (booking) => {
  if (booking.hoursCompleted) return false;
  if (!["accepted", "confirmed", "in_progress"].includes(booking.status)) return false;
  // Legacy bookings (no OTP flow yet) still complete on the static schedule;
  // OTP-started bookings complete on the live service clock.
  if (!booking.serviceStartedAt && booking.serviceOtp) return false;
  const end = sessionEndDate(booking);
  if (!end || Date.now() < end.getTime()) return false;
  booking.hoursCompleted = true;
  booking.hoursCompletedAt = new Date();
  await booking.save();
  await Notification.create({
    user: booking.customer,
    type: "cooking_hours_completed",
    message: "Your cooking hours are complete! Please review your session.",
  });
  await Notification.create({
    user: booking.cook,
    type: "cooking_hours_completed",
    message: "Cooking hours complete for this booking! Please wrap up your session.",
  });
  return true;
};

// Shared helper: mark booking arrived once, notify the customer.
const markArrivedIfNeeded = async (booking, source) => {
  if (booking.cookArrived) return false;
  booking.cookArrived = true;
  booking.cookArrivedAt = new Date();
  if (["accepted", "confirmed"].includes(booking.status)) {
    booking.status = "in_progress";
    booking.statusHistory.push({ status: "in_progress", note: `Cook arrived (${source})` });
  } else {
    booking.statusHistory.push({ status: booking.status, note: `Cook arrived (${source})` });
  }
  await booking.save();
  await Notification.create({
    user: booking.customer,
    type: "cook_arrived",
    message: `Your cook has reached your location (${source === "auto" ? "GPS detected" : "confirmed by cook"})!`,
  });
  return true;
};

// Fields a customer may set when creating a booking. Everything else
// (customer, status, payment, amount, cookArrived, hoursCompleted, dates)
// is derived server-side. Without this whitelist a customer could POST
// `{ customer: <someoneElseId>, cookArrived: true, hoursCompleted: true,
// cookLocation: {...} }` — the old `Booking.create({ customer: req.user.id,
// ...req.body, ... })` spread put the body AFTER customer, so a body
// `customer` field silently OVERRODE the authenticated user and injected
// lifecycle flags.
const BOOKING_CUSTOMER_FIELDS = [
  "serviceType",
  "selectedItems",
  "startTime",
  "endTime",
  "address",
  "addressDetails",
  "location",
  "guests",
  "durationHours",
  "notes",
];
const pickBookingCustomerFields = (obj) => {
  const out = {};
  for (const key of BOOKING_CUSTOMER_FIELDS) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
};

exports.createBooking = async (req, res, next) => {
  try {
    const { cook, date, startTime, endTime } = req.body;

    const cookProfile = await CookProfile.findOne({
      user: cook,
      approvalStatus: "approved",
    });
    if (!cookProfile) {
      return res.status(400).json({ message: "Cook not found or not approved" });
    }

    // The cook's own unavailable toggle is the only opt-out from the
    // default all-hours availability (auto-resets the next day).
    if (!(await resolveCookAvailability(cookProfile))) {
      return res.status(400).json({ message: "Cook is currently unavailable — please try another cook or date" });
    }

    // The requested window must fit inside one of the cook's open windows.
    // Overlap is checked against every booking currently occupying the
    // calendar: accepted/confirmed/in_progress (permanent) AND pending
    // "requested" ones inside their 5-minute hold (see getDayBookings), so a
    // held slot is invisible and unbookable for all other customers.
    const windows = await getDayWindows(cook, date);
    const containing = findContainingWindow(windows, startTime, endTime);
    if (!containing) {
      return res.status(400).json({ message: "Cook is not available for the selected time" });
    }
    const activeBookings = await getDayBookings(cook, date);
    const clash = findOverlapBooking(activeBookings, startTime, endTime);
    if (clash) {
      return res.status(409).json({ message: "This slot is no longer available — it's booked or on hold for another request. Please pick a different start time." });
    }

    // Payment is optional (online pay-before-booking removed): when Razorpay
    // details are supplied they are verified as before, otherwise the booking
    // is created with payment.status "pending".
    const payment = req.body.payment || {};
    const razorpayOrderId = payment.razorpayOrderId || req.body.razorpayOrderId;
    const razorpayPaymentId = payment.razorpayPaymentId || req.body.razorpayPaymentId;
    const razorpaySignature = payment.razorpaySignature || req.body.razorpaySignature;
    const hasPayment = Boolean(razorpayOrderId && razorpayPaymentId && razorpaySignature);
    if (hasPayment) {
      if (!process.env.RAZORPAY_KEY_SECRET) {
        return res.status(503).json({ message: "Payments cannot be verified right now. Try again later." });
      }
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");
      if (expectedSignature !== razorpaySignature) {
        return res.status(402).json({ message: "Payment verification failed. Please try paying again." });
      }
    }
    const startMin = timeToMinutes(startTime);
    const endMin = timeToMinutes(endTime);
    if (startMin == null || endMin == null || endMin <= startMin) {
      return res.status(400).json({ message: "Invalid time slot" });
    }
    const billedHours = (endMin - startMin) / 60;
    // Launch price list covers whole-hour 1–4h sessions only.
    if (![1, 2, 3, 4].includes(billedHours)) {
      return res.status(400).json({ message: "Sessions run 1–4 hours" });
    }
    // The stated duration must match the selected window (windows are sized
    // from the input service hours).
    if (req.body.durationHours != null && req.body.durationHours !== "") {
      const stated = Number(req.body.durationHours);
      if (!Number.isFinite(stated) || Math.abs(stated - billedHours) > 0.001) {
        return res.status(400).json({ message: "Duration does not match the selected time slot" });
      }
    }
    // Launch slab pricing — the fee comes from the price list, never from
    // the client and no longer from the cook's rack rate.
    const slabPrice = slabPriceForDuration(billedHours);
    if (slabPrice == null) {
      return res.status(400).json({ message: "Sessions run 1–4 hours" });
    }
    // Optional coupon: re-validated fresh here (eligibility, min order,
    // service, first-booking) and redeemed on success. The /validate
    // endpoint only previews — it never mutates usage.
    let couponCode = "";
    let discount = 0;
    const rawCode = normalizeCode(req.body.couponCode);
    if (rawCode) {
      const coupon = await Coupon.findOne({ code: rawCode });
      const isFirstBooking =
        (await Booking.countDocuments({ customer: req.user.id })) === 0;
      const reason = rejectionReason(coupon, {
        amount: slabPrice,
        userId: req.user.id,
        serviceType: req.body.serviceType,
        isFirstBooking,
      });
      if (reason) {
        return res.status(400).json({ message: reason });
      }
      discount = computeDiscount(coupon, slabPrice);
      if (discount <= 0) {
        return res.status(400).json({ message: "This coupon gives no discount on this order." });
      }
      couponCode = coupon.code;
      coupon.usedCount = Number(coupon.usedCount || 0) + 1;
      coupon.usedBy.push(req.user.id);
      await coupon.save();
    }
    // ~10% platform commission; the cook earns the rest of the final amount.
    const { finalAmount, commission, cookPayout } = splitPayout(slabPrice - discount);
    const expectedAmount = finalAmount;
    if (hasPayment) {
      const paidAmount = Number(req.body.amount ?? payment.paidAmount);
      if (!Number.isFinite(paidAmount) || Math.round(paidAmount) !== expectedAmount) {
        return res.status(400).json({
          message: `Paid amount does not match the payable fee of ₹${expectedAmount}. Please create a fresh payment.`,
        });
      }
    }

    const booking = await Booking.create({
      customer: req.user.id,
      cook,
      ...pickBookingCustomerFields(req.body),
      // billedHours is validated above to match any stated duration, so it is
      // the authoritative duration — persisting it keeps reschedule/start
      // working even when the client omits the optional durationHours field.
      durationHours: billedHours,
      date: parseDay(date),
      amount: expectedAmount,
      slabPrice,
      couponCode,
      discount,
      commission,
      cookPayout,
      payment: hasPayment
        ? {
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            status: "paid",
            paidAmount: expectedAmount,
            paidAt: new Date(),
          }
        : {
            status: "pending",
            paidAmount: 0,
          },
      status: "requested",
      requestExpiresAt: new Date(Date.now() + REQUEST_WINDOW_MS),
      statusHistory: [{ status: "requested" }],
      // Every order gets its own 4-digit service-start OTP. Generated once
      // at creation (never regenerated later), shown only to the customer.
      serviceOtp: generateServiceOtp(),
      serviceOtpGeneratedAt: new Date(),
    });

    // Close the two-user race: two customers can pass the pre-create overlap
    // check at the same moment. Re-check AFTER inserting — if an older rival
    // (smaller _id = created earlier) occupies an overlapping interval, this
    // request loses: delete it and tell this customer the slot went elsewhere.
    // The older request never deletes itself, so at most one of two racing
    // requests survives and the slot can never end up double-booked.
    try {
      const { start: raceDayStart, end: raceDayEnd } = dayBounds(booking.date);
      const rivals = await Booking.find({
        cook,
        _id: { $ne: booking._id },
        date: { $gte: raceDayStart, $lte: raceDayEnd },
        $or: activeSlotMatch(),
      }).select("startTime endTime status");
      const raceStart = timeToMinutes(booking.startTime);
      const raceEnd = timeToMinutes(booking.endTime);
      const rival = (rivals || []).find((r) => {
        const rs = timeToMinutes(r.startTime);
        const re = timeToMinutes(r.endTime);
        return rs != null && re != null && intervalsOverlap(raceStart, raceEnd, rs, re);
      });
      if (rival && String(rival._id) < String(booking._id)) {
        await Booking.findByIdAndDelete(booking._id);
        return res.status(409).json({
          message: "This slot was just claimed by another booking request. Please pick a different start time.",
        });
      }
    } catch {
      // non-fatal: the pre-create check already covers the common cases
    }

    // Build WhatsApp URLs for cook notification

    await Notification.create({
      user: cook,
      type: "booking_request",
      message: `New booking request from ${req.user.name || "a customer"}`,
    });

    // Build WhatsApp deep links:
    // - `whatsappUrl` targets the COOK's number (order details + venue pin).
    //   The customer app opens this right after sending the request.
    // - `customerWhatsappUrl` targets the USER's own WhatsApp (pending details;
    //   the CONFIRMED booked message with cook name/phone/tracking is built on accept).
    let whatsappUrl = null;
    let customerWhatsappUrl = null;
    let cookPhone = null;
    const trackingUrl = buildTrackingUrl(booking._id);
    try {
      const cookUser = await User.findById(cook).select("phone name");
      const customer = await User.findById(req.user.id).select("name phone");
      cookPhone = cookUser?.phone || null;
      whatsappUrl = buildBookingWhatsAppUrl({
        cookPhone,
        customerName: customer?.name || req.user.name,
        customerPhone: customer?.phone,
        booking,
      });
      const cookLive = cookProfile?.liveLocation?.lat != null ? cookProfile.liveLocation : null;
      customerWhatsappUrl = buildCustomerWhatsAppUrl({
        customerPhone: customer?.phone,
        cookName: cookUser?.name,
        cookPhone,
        cookLocation: booking.cookLocation?.lat != null ? booking.cookLocation : cookLive,
        booking,
        trackingUrl,
      });
    } catch {
      whatsappUrl = null;
      customerWhatsappUrl = null;
    }

    const bookingObj = booking.toObject ? booking.toObject() : booking;
    res.status(201).json({ ...bookingObj, whatsappUrl, customerWhatsappUrl, cookPhone, trackingUrl });
  } catch (error) {
    next(error);
  }
};

// ── 5-minute confirmation windows ──────────────────────────────────────────
// REQUEST_WINDOW_MS: the cook must accept within 5 minutes of the request.
// PAYMENT_WINDOW_MS: once accepted, the customer must pay within 5 minutes,
// otherwise the booking auto-cancels and the slot is freed.
const REQUEST_WINDOW_MS = 5 * 60 * 1000;
const PAYMENT_WINDOW_MS = 5 * 60 * 1000;

// Lazy expiry pass, run whenever a booking is read. Returns the booking when
// a transition happened so callers can re-read fresh fields.
// - "requested" older than 5 minutes → "expired" (customer's waiting screen
//   shows the sorry state and redirects them to Find Cooks).
// - "accepted" but unpaid after 5 minutes → "cancelled" (slot released).
const expireBookingIfNeeded = async (booking) => {
  try {
    const now = new Date();
    if (
      booking.status === "requested" &&
      booking.requestExpiresAt &&
      booking.requestExpiresAt < now
    ) {
      booking.status = "expired";
      booking.statusHistory.push({
        status: "expired",
        note: "Cook did not respond within 5 minutes",
      });
      await booking.save();
      return booking;
    }
    if (
      booking.status === "accepted" &&
      booking.payment?.status !== "paid" &&
      booking.paymentExpiresAt &&
      booking.paymentExpiresAt < now
    ) {
      booking.status = "cancelled";
      booking.statusHistory.push({
        status: "cancelled",
        note: "Payment not completed within 5 minutes — slot released",
      });
      await booking.save();
      return booking;
    }
  } catch {
    // non-fatal; retried on the next read
  }
  return null;
};

exports.getMyBookings = async (req, res, next) => {  try {
    const bookings = await Booking.find({ customer: req.user.id })
      .populate("cook", "name email phone")
      .sort({ date: -1 });
    // Attach each cook's current live location (from CookProfile) so the
    // frontend can share "order details + cook's live location" to the
    // user's own WhatsApp even before a per-booking snapshot exists.
    const cookIds = [...new Set(bookings.map((b) => b.cook?._id?.toString()).filter(Boolean))];
    let liveByUserId = {};
    if (cookIds.length) {
      const profiles = await CookProfile.find({ user: { $in: cookIds } }).select("user liveLocation");
      liveByUserId = Object.fromEntries(
        profiles.map((p) => [p.user.toString(), p.liveLocation || null])
      );
    }
    // Submitted reviews keyed by booking id (one review per booking max).
    let reviewByBookingId = {};
    try {
      const Review = require("../models/Review");
      const reviews = await Review.find({
        booking: { $in: bookings.map((b) => b._id) },
      }).select("booking rating comment createdAt");
      reviewByBookingId = Object.fromEntries(
        reviews.map((r) => [r.booking.toString(), r.toObject ? r.toObject() : r])
      );
    } catch {
      reviewByBookingId = {};
    }
    const out = bookings.map((b) => {
      const obj = b.toObject ? b.toObject() : b;
      const live = liveByUserId[b.cook?._id?.toString()] || null;
      return {
        ...obj,
        cookLiveLocation: live?.lat != null ? live : null,
        // Effective cook location: per-booking snapshot wins, else live.
        effectiveCookLocation:
          obj.cookLocation?.lat != null ? obj.cookLocation : live?.lat != null ? live : null,
        // Submitted review for completed services (one per booking).
        review: reviewByBookingId[b._id.toString()] || null,
      };
    });
    // Time-based alarm: flag any active booking whose session end passed, and
    // lazily expire requests / unpaid acceptances whose window elapsed.
    for (const b of bookings) {
      try {
        await markHoursCompleteIfNeeded(b);
        await expireBookingIfNeeded(b);
      } catch {
        // non-fatal; alarm retries on next fetch
      }
    }
    // Re-read flagged fields so the response includes fresh hoursCompleted.
    const flagged = new Set(bookings.filter((b) => b.hoursCompleted).map((b) => b._id.toString()));
    let selfPhone = null;
    try {
      const self = await User.findById(req.user.id).select("phone name");
      selfPhone = self?.phone || null;
    } catch {
      selfPhone = null;
    }
    const finalOut = out.map((o) => {
      const match = bookings.find((b) => b._id.toString() === o._id.toString());
      if (match && flagged.has(o._id.toString())) {
        o.hoursCompleted = match.hoursCompleted;
        o.hoursCompletedAt = match.hoursCompletedAt;
      }
      if (match) {
        // Reflect lazy expiry transitions (requested→expired, accepted
        // unpaid→cancelled) that happened during the pass above.
        o.status = match.status;
        o.statusHistory = match.statusHistory;
        o.requestExpiresAt = match.requestExpiresAt;
        o.paymentExpiresAt = match.paymentExpiresAt;
      }
      const end = sessionEndDate(match || o);
      o.sessionEnd = end ? end.toISOString() : null;
      // Hours-complete WhatsApp alarm addressed to the customer (self).
      o.hoursCompleteWhatsappUrl = o.hoursCompleted
        ? buildHoursCompleteWhatsAppUrl({
            toPhone: selfPhone,
            booking: { ...o, hoursCompletedAt: o.hoursCompletedAt },
            cookName: o.cook?.name,
            cookPhone: o.cook?.phone,
            customerName: null,
          })
        : null;
      // Completed: rating reminder with a link to the booking review page.
      if (o.status === "completed") {
        const reviewUrl = `${FRONTEND_BASE_URL}/bookings/${o._id}`;
        o.reviewUrl = reviewUrl;
        o.reviewWhatsappUrl = buildReviewWhatsAppUrl({
          customerPhone: selfPhone,
          cookName: o.cook?.name,
          booking: o,
          reviewUrl,
        });
      } else {
        o.reviewUrl = null;
        o.reviewWhatsappUrl = null;
      }
      return o;
    });
    res.json(finalOut);
  } catch (error) {
    next(error);
  }
};

exports.getCookBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ cook: req.user.id })
      .populate("customer", "name email phone")
      .sort({ date: -1 });
    for (const b of bookings) {
      try {
        await markHoursCompleteIfNeeded(b);
        await expireBookingIfNeeded(b);
      } catch {
        // non-fatal
      }
    }
    const out = bookings.map((b) => {
      const obj = b.toObject ? b.toObject() : b;
      const end = sessionEndDate(b);
      // Cook never sees the OTP — they ask the customer for it in person.
      delete obj.serviceOtp;
      return { ...obj, sessionEnd: end ? end.toISOString() : null };
    });
    // Submitted customer ratings keyed by booking id (one per booking max),
    // so the cook can view the rating for each completed service.
    let cookReviewByBookingId = {};
    try {
      const Review = require("../models/Review");
      const reviews = await Review.find({
        booking: { $in: bookings.map((b) => b._id) },
      })
        .populate("customer", "name")
        .select("booking customer rating comment createdAt");
      cookReviewByBookingId = Object.fromEntries(
        reviews.map((r) => [
          r.booking.toString(),
          { ...(r.toObject ? r.toObject() : r) },
        ])
      );
    } catch {
      cookReviewByBookingId = {};
    }
    // Hours-complete WhatsApp alarm addressed to the cook (self).
    let cookSelfPhone = null;
    try {
      const self = await User.findById(req.user.id).select("phone");
      cookSelfPhone = self?.phone || null;
    } catch {
      cookSelfPhone = null;
    }
    const finalCookOut = out.map((o) => ({
      ...o,
      review: cookReviewByBookingId[o._id.toString()] || null,
      hoursCompleteWhatsappUrl: o.hoursCompleted
        ? buildHoursCompleteWhatsAppUrl({
            toPhone: cookSelfPhone,
            booking: { ...o, hoursCompletedAt: o.hoursCompletedAt },
            cookName: null,
            cookPhone: cookSelfPhone,
            customerName: o.customer?.name,
          })
        : null,
    }));
    res.json(finalCookOut);
  } catch (error) {
    next(error);
  }
};

exports.acceptBooking = async (req, res, next) => {
  try {
    // Cooks act only on their own bookings; admins may moderate any booking.
    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.cook = req.user.id;
    const booking = await Booking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.status !== "requested") {
      return res.status(400).json({ message: "Only pending requests can be accepted" });
    }

    // 5-minute window: a late accept is refused so the customer never waits
    // on a request that already timed out on their waiting screen.
    if (booking.requestExpiresAt && booking.requestExpiresAt < new Date()) {
      booking.status = "expired";
      booking.statusHistory.push({
        status: "expired",
        note: "Cook did not respond within 5 minutes",
      });
      await booking.save();
      await Notification.create({
        user: booking.customer,
        type: "booking_expired",
        message:
          "Your booking request expired — the cook didn't respond within 5 minutes. Please find another cook.",
      });
      return res.status(410).json({
        message:
          "This request expired after 5 minutes. The customer has been notified to choose another cook.",
      });
    }

    // First accept wins: refuse if the slot has been booked since the request.
    const cookIdForCheck = req.user.role === "admin" ? booking.cook : req.user.id;
    try {
      const { start: dayStart, end: dayEnd } = dayBounds(booking.date);
      const rivals = await Booking.find({
        cook: cookIdForCheck,
        _id: { $ne: booking._id },
        date: { $gte: dayStart, $lte: dayEnd },
        status: { $in: ["accepted", "confirmed", "in_progress"] },
      }).select("startTime endTime status");
      const s = timeToMinutes(booking.startTime);
      const e = timeToMinutes(booking.endTime);
      const overlaps = (rivals || []).some((r) => {
        const rs = timeToMinutes(r.startTime);
        const re = timeToMinutes(r.endTime);
        return rs != null && re != null && intervalsOverlap(s, e, rs, re);
      });
      if (overlaps) {
        return res.status(409).json({
          message: "This slot has already been booked (another request was accepted). Please decline this request.",
        });
      }
    } catch {
      // non-fatal: fall through to accept
    }

    booking.status = "accepted";
    // Audit trail: mark admin-assisted accepts so the booking history shows
    // that an admin pressed the button on the cook's behalf.
    booking.statusHistory.push({
      status: "accepted",
      ...(req.user.role === "admin" ? { note: "Accepted by admin on behalf of the cook" } : {}),
    });
    // Customer now has 5 minutes to pay before the slot is released.
    booking.paymentExpiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS);
    // Snapshot the cook's current live location onto the booking so the
    // customer receives the cook's location on their WhatsApp.
    const cookId = req.user.role === "admin" ? booking.cook : req.user.id;
    try {
      const profile = await CookProfile.findOne({ user: cookId }).select("liveLocation");
      if (profile?.liveLocation?.lat != null && booking.cookLocation?.lat == null) {
        booking.cookLocation = {
          lat: profile.liveLocation.lat,
          lng: profile.liveLocation.lng,
          updatedAt: new Date(),
        };
      }
    } catch {
      // non-fatal: accept succeeds even without a location snapshot
    }
    await booking.save();

    await Notification.create({
      user: booking.customer,
      type: "booking_accepted",
      message:
        "Your booking request has been accepted! Complete payment within 5 minutes to confirm your slot.",
    });

    // When an admin accepted on the cook's behalf, alert the cook — their
    // calendar just gained a booked slot and they would otherwise never know.
    if (req.user.role === "admin") {
      try {
        const customerUser = await User.findById(booking.customer).select("name");
        const dateLabel = new Date(booking.date).toLocaleDateString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        await Notification.create({
          user: booking.cook,
          type: "booking_accepted",
          message: `An admin accepted a service request on your behalf for ${
            customerUser?.name || "a customer"
          } — ${dateLabel}, ${booking.startTime}–${booking.endTime}. The slot is booked; the customer has 5 minutes to complete payment.`,
        });
      } catch {
        // non-fatal: the accept itself already succeeded
      }
    }

    // Include a customer-targeted "BOOKED" WhatsApp confirmation (cook name +
    // cook phone + live tracking link + cook live location) so the cook app
    // can forward it to the user in one tap, and the customer sees it under
    // My Bookings.
    let customerWhatsappUrl = null;
    let trackingUrl = buildTrackingUrl(booking._id);
    let cookPhoneForCustomer = null;
    try {
      const cookUser = await User.findById(cookId).select("name phone");
      const customer = await User.findById(booking.customer).select("phone");
      const profile = await CookProfile.findOne({ user: cookId }).select("liveLocation");
      const cookLoc =
        booking.cookLocation?.lat != null
          ? booking.cookLocation
          : profile?.liveLocation?.lat != null
            ? profile.liveLocation
            : null;
      cookPhoneForCustomer = cookUser?.phone || null;
      customerWhatsappUrl = buildCustomerWhatsAppUrl({
        customerPhone: customer?.phone,
        cookName: cookUser?.name,
        cookPhone: cookUser?.phone,
        cookLocation: cookLoc,
        booking,
        trackingUrl,
      });
    } catch {
      customerWhatsappUrl = null;
    }

    const obj = booking.toObject ? booking.toObject() : booking;
    res.json({ ...obj, customerWhatsappUrl, trackingUrl, cookPhone: cookPhoneForCustomer });
  } catch (error) {
    next(error);
  }
};

exports.rejectBooking = async (req, res, next) => {
  try {
    // Cooks act only on their own bookings; admins may moderate any booking.
    // Only pending "requested" bookings can be declined (ignore/cancel path).
    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.cook = req.user.id;
    const booking = await Booking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.status !== "requested") {
      return res.status(400).json({ message: "Only pending requests can be declined" });
    }

    booking.status = "rejected";
    booking.statusHistory.push({
      status: "rejected",
      ...(req.user.role === "admin" ? { note: "Declined by admin on behalf of the cook" } : {}),
    });
    await booking.save();

    // No availability flip-back needed: bookings only carve out part of an
    // open window, which stays bookable for its remaining free time.

    await Notification.create({
      user: booking.customer,
      type: "booking_rejected",
      message: "Your booking request has been rejected.",
    });

    // Tell the cook when an admin declined on their behalf so they know the
    // request was handled and the slot stayed open.
    if (req.user.role === "admin") {
      try {
        await Notification.create({
          user: booking.cook,
          type: "booking_rejected",
          message: "An admin declined a service request on your behalf — the slot remains open.",
        });
      } catch {
        // non-fatal: the reject itself already succeeded
      }
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

exports.completeBooking = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.cook = req.user.id;
    const booking = await Booking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!["accepted", "confirmed", "in_progress"].includes(booking.status)) {
      return res.status(400).json({ message: "Only active (accepted) bookings can be marked completed" });
    }

    booking.status = "completed";
    booking.statusHistory.push({ status: "completed" });
    await booking.save();

    // Website (in-app) notification prompting the customer to rate the cook.
    let cookNameForMsg = "your cook";
    try {
      const cookUser = await User.findById(booking.cook).select("name");
      if (cookUser?.name) cookNameForMsg = cookUser.name;
    } catch {
      // non-fatal
    }
    await Notification.create({
      user: booking.customer,
      type: "booking_completed",
      message: `Service complete! ${cookNameForMsg} finished your session — please rate your cook.`,
    });

    // WhatsApp rating reminder to the customer's own number, with a link to
    // the booking page where the review form lives.
    let reviewWhatsappUrl = null;
    let reviewUrl = `${FRONTEND_BASE_URL}/bookings/${booking._id}`;
    try {
      const customer = await User.findById(booking.customer).select("phone");
      reviewWhatsappUrl = buildReviewWhatsAppUrl({
        customerPhone: customer?.phone,
        cookName: cookNameForMsg,
        booking,
        reviewUrl,
      });
    } catch {
      reviewWhatsappUrl = null;
    }

    const completedObj = booking.toObject ? booking.toObject() : booking;
    res.json({ ...completedObj, reviewWhatsappUrl, reviewUrl });
  } catch (error) {
    next(error);
  }
};

// Permanently remove a booking from the customer's history. Only the booking's
// own customer may delete, and only records that never became a real
// engagement: the cook never accepted (requested / rejected / expired) or the
// customer already cancelled it. Anything with captured money is kept for the
// financial trail — support can help with those.
exports.deleteBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (booking.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const DELETABLE_STATUSES = ["requested", "rejected", "expired", "cancelled"];
    if (!DELETABLE_STATUSES.includes(booking.status)) {
      return res.status(400).json({
        message: "Only bookings that were not accepted by the cook, or that you cancelled, can be deleted",
      });
    }

    if (booking.payment?.status === "paid") {
      return res.status(400).json({
        message: "This booking has a payment history and cannot be deleted. Please contact support.",
      });
    }

    await Booking.findByIdAndDelete(booking._id);
    res.json({ message: "Booking deleted", id: req.params.id });
  } catch (error) {
    next(error);
  }
};

exports.cancelBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const isCustomer = booking.customer.toString() === req.user.id;
    const isCook = booking.cook.toString() === req.user.id;
    if (!isCustomer && !isCook) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (["completed", "cancelled", "rejected", "expired"].includes(booking.status)) {
      return res.status(400).json({ message: "Booking cannot be cancelled" });
    }

    booking.status = "cancelled";
    booking.statusHistory.push({ status: "cancelled" });

    // Paid bookings are refunded on cancel — never keep captured money for a
    // cancelled session. Conditions: a real (non-test) gateway payment id
    // must exist and the gateway must be configured; otherwise the refund is
    // flagged for manual settlement. A failed gateway refund never blocks the
    // cancellation itself — it is recorded for support follow-up.
    let refundNote = "";
    try {
      const pay = booking.payment || {};
      if (pay.status === "paid" && (pay.paidAmount > 0 || booking.amount > 0)) {
        const refundAmount = Math.round(Number(pay.paidAmount || booking.amount || 0));
        if (pay.razorpayPaymentId && !pay.testMode && razorpayConfigured && razorpayClient) {
          try {
            const refund = await razorpayClient.payments.refund(pay.razorpayPaymentId, {
              amount: refundAmount * 100,
              speed: "normal",
              notes: { booking: String(booking._id), reason: "booking_cancelled" },
            });
            booking.payment.refundId = refund?.id || "";
            booking.payment.refundStatus = "processed";
            booking.payment.refundAmount = refundAmount;
            booking.payment.refundedAt = new Date();
            refundNote = ` Refund of ₹${refundAmount} initiated — it reaches your account in 5–7 business days.`;
          } catch (refundErr) {
            booking.payment.refundStatus = "failed";
            booking.payment.refundAmount = refundAmount;
            refundNote =
              " Your refund could not be processed automatically — please contact support with your payment ID.";
          }
        } else {
          // Test checkout (no real money) or unconfigured gateway: nothing to
          // reverse at Razorpay; mark for manual settlement if real money exists.
          booking.payment.refundStatus = "manual";
          booking.payment.refundAmount = refundAmount;
          refundNote = pay.testMode
            ? " (Test payment — no real money moved.)"
            : " Our team will settle your refund manually within 5–7 business days.";
        }
      }
    } catch {
      // non-fatal: cancellation itself must always succeed
    }
    await booking.save();

    // No availability flip-back needed (see rejectBooking).

    const notifyUser = isCustomer ? booking.cook : booking.customer;
    await Notification.create({
      user: notifyUser,
      type: "booking_cancelled",
      message: "A booking has been cancelled.",
    });
    // The payer always hears about the refund outcome, even when the other
    // party cancelled.
    if (refundNote) {
      try {
        await Notification.create({
          user: booking.customer,
          type: "booking_cancelled",
          message: `Booking cancelled.${refundNote}`,
        });
      } catch {
        // non-fatal
      }
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

// Customer moves an upcoming booking to a new date/start time. Duration (and
// therefore the fee) stays fixed so paid bookings need no re-settlement.
// Only requested/accepted/confirmed bookings can move — never in-progress,
// completed, cancelled, rejected or expired ones. The new slot must sit
// inside one of the cook's open windows and clash with nothing else (the
// booking being moved is excluded from its own overlap check). Both sides
// are notified; nothing here needs the cook's pre-approval, so the messages
// make the change impossible to miss.
exports.rescheduleBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (booking.customer.toString() !== req.user.id) {
      return res.status(403).json({ message: "Only the customer can reschedule this booking" });
    }
    if (!["requested", "accepted", "confirmed"].includes(booking.status)) {
      return res.status(400).json({ message: "Only upcoming bookings can be rescheduled" });
    }

    const { date, startTime } = req.body || {};
    const startMin = timeToMinutes(startTime);
    if (startMin == null) {
      return res.status(400).json({ message: "Valid start time (HH:MM) is required" });
    }
    const day = parseDay(date);
    if (Number.isNaN(day.getTime())) {
      return res.status(400).json({ message: "Valid date is required" });
    }
    if (localDayString(day) < localDayString()) {
      return res.status(400).json({ message: "That date already passed — please pick today or a future date" });
    }

    const durMin = Math.round(Number(booking.durationHours || 0) * 60);
    if (!Number.isFinite(durMin) || durMin < 30) {
      return res.status(400).json({ message: "This booking has no usable duration — please contact support" });
    }
    const endMin = startMin + durMin;
    // Service day 08:00–20:00, mirroring the slot engine.
    if (startMin < 8 * 60 || endMin > 20 * 60) {
      return res.status(400).json({ message: "Sessions must run between 8:00 AM and 8:00 PM" });
    }

    const windows = await getDayWindows(booking.cook, date);
    const endTime = minutesToTime(endMin);
    if (!findContainingWindow(windows, startTime, endTime)) {
      return res.status(400).json({ message: "Cook is not available at the selected time — please pick a slot shown as free" });
    }
    const rivals = (await getDayBookings(booking.cook, date)).filter(
      (b) => String(b._id) !== String(booking._id)
    );
    if (findOverlapBooking(rivals, startTime, endTime)) {
      return res.status(409).json({ message: "That time just got booked — please pick another start time" });
    }

    const oldLabel = `${booking.date ? new Date(booking.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""} ${booking.startTime || ""}–${booking.endTime || ""}`.trim();
    booking.date = day;
    booking.startTime = startTime;
    booking.endTime = endTime;
    const newLabel = `${day.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${startTime}–${endTime}`;
    booking.statusHistory.push({
      status: booking.status,
      note: `Rescheduled from ${oldLabel} to ${newLabel} by customer`,
    });
    await booking.save();

    try {
      await Notification.create({
        user: booking.cook,
        type: "booking_rescheduled",
        message: `Booking rescheduled to ${newLabel} by the customer. Please check your schedule.`,
      });
      await Notification.create({
        user: booking.customer,
        type: "booking_rescheduled",
        message: `Your booking moved to ${newLabel}. Your cook has been notified.`,
      });
    } catch {
      // non-fatal: the move itself must always succeed
    }

    res.json(booking);
  } catch (error) {
    next(error);
  }
};

// Cook starts the service by entering the customer's 4-digit OTP (read out
// to them in person at the venue). Sets the live service clock
// (serviceStartedAt → serviceEndsAt = start + booked duration) and marks
// arrival, so the hours-complete alarm counts real cooking time. Idempotent:
// re-submitting after a start returns the current state. The OTP is never
// returned to the cook — every response here is stripped.
exports.startService = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.cook = req.user.id;
    const booking = await Booking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (!["accepted", "confirmed", "in_progress"].includes(booking.status)) {
      return res.status(400).json({ message: "Only accepted bookings can start service" });
    }
    if (booking.serviceStartedAt) {
      const obj = stripServiceOtp(booking);
      return res.json({ ...obj, serviceStarted: true });
    }
    const otp = String(req.body?.otp || "").trim();
    if (!booking.serviceOtp || otp !== String(booking.serviceOtp)) {
      return res.status(400).json({ message: "Incorrect OTP — please ask the customer for the 4-digit code shown on their booking" });
    }
    const durMin = Math.round(Number(booking.durationHours || 0) * 60);
    if (!Number.isFinite(durMin) || durMin < 30) {
      return res.status(400).json({ message: "This booking has no usable duration — please contact support" });
    }
    const startedAt = new Date();
    booking.serviceStartedAt = startedAt;
    booking.serviceEndsAt = new Date(startedAt.getTime() + durMin * 60 * 1000);
    await markArrivedIfNeeded(booking, "manual");
    if (booking.status !== "in_progress") {
      booking.status = "in_progress";
      booking.statusHistory.push({ status: "in_progress", note: "Service started (OTP verified)" });
    } else {
      booking.statusHistory.push({ status: "in_progress", note: "Service started (OTP verified)" });
    }
    await booking.save();
    try {
      await Notification.create({
        user: booking.customer,
        type: "service_started",
        message: "Your service has started — enjoy your session! The hours are now being counted.",
      });
    } catch {
      // non-fatal
    }
    const obj = stripServiceOtp(booking);
    res.json({ ...obj, serviceStarted: true });
  } catch (error) {
    next(error);
  }
};

// Cook shares their current live location for a specific booking. Stores a
// snapshot on the booking + updates the cook profile, and returns a
// customer-targeted WhatsApp link (order details + cook live location).
// Auto-detects arrival when the cook is within ARRIVAL_RADIUS_KM of the venue
// and notifies the customer.
exports.shareCookLocation = async (req, res, next) => {
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
    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.cook = req.user.id;
    const booking = await Booking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    booking.cookLocation = {
      lat,
      lng,
      ...(acc !== undefined ? { accuracy: acc } : {}),
      updatedAt: new Date(),
    };

    // Auto arrival: cook GPS within radius of the venue pin. Skipped for poor
    // fixes (accuracy > 500 m) so a coarse network fix can't fake an arrival.
    let justArrived = false;
    if (!booking.cookArrived && booking.location?.lat != null) {
      const fixTooCoarse = acc !== undefined && acc > 500;
      const dist = fixTooCoarse ? null : haversineKm({ lat, lng }, booking.location);
      if (dist != null && dist <= ARRIVAL_RADIUS_KM) {
        await markArrivedIfNeeded(booking, "auto");
        justArrived = true;
      } else {
        await booking.save();
      }
    } else {
      await booking.save();
    }
    await CookProfile.findOneAndUpdate(
      { user: req.user.role === "admin" ? booking.cook : req.user.id },
      {
        liveLocation: {
          lat,
          lng,
          ...(acc !== undefined ? { accuracy: acc } : {}),
          updatedAt: new Date(),
        },
      }
    );

    let customerWhatsappUrl = null;
    try {
      const cookUser = await User.findById(req.user.role === "admin" ? booking.cook : req.user.id).select("name phone");
      const customer = await User.findById(booking.customer).select("phone");
      customerWhatsappUrl = buildCustomerWhatsAppUrl({
        customerPhone: customer?.phone,
        cookName: cookUser?.name,
        cookPhone: cookUser?.phone,
        cookLocation: booking.cookLocation,
        booking,
      });
    } catch {
      customerWhatsappUrl = null;
    }

    // Cook-facing response: never leak the service-start OTP.
    const obj = stripServiceOtp(booking);
    res.json({ ...obj, customerWhatsappUrl, justArrived });
  } catch (error) {
    next(error);
  }
};

// Manual arrival: cook taps "I've arrived". Notifies the customer even when
// GPS is imprecise or the venue has no exact pin.
exports.markCookArrived = async (req, res, next) => {
  try {
    const filter = { _id: req.params.id };
    if (req.user.role !== "admin") filter.cook = req.user.id;
    const booking = await Booking.findOne(filter);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    if (["completed", "cancelled", "rejected"].includes(booking.status)) {
      return res.status(400).json({ message: "Booking is no longer active" });
    }
    const justArrived = await markArrivedIfNeeded(booking, "manual");
    // Cook-facing response: never leak the service-start OTP.
    const obj = stripServiceOtp(booking);
    res.json({ ...obj, justArrived });
  } catch (error) {
    next(error);
  }
};

// Live tracking payload for a single booking. Visible to the customer who
// owns it, the assigned cook, or an admin. Returns venue + cook live
// positions so the website can render a live map for the customer.
exports.getBookingLiveTracking = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("cook", "name phone")
      .populate("customer", "name phone");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const isCustomer = booking.customer?._id?.toString() === req.user.id;
    const isCook = booking.cook?._id?.toString() === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isCustomer && !isCook && !isAdmin) {
      return res.status(403).json({ message: "Not authorized" });
    }

    let cookLiveLocation = null;
    try {
      const profile = await CookProfile.findOne({ user: booking.cook._id }).select(
        "liveLocation serviceArea"
      );
      if (profile?.liveLocation?.lat != null) cookLiveLocation = profile.liveLocation;
    } catch {
      cookLiveLocation = null;
    }

    const snapshot = booking.cookLocation?.lat != null ? booking.cookLocation : null;
    const effectiveCookLocation = snapshot || cookLiveLocation;

    // Time-based alarm for this booking.
    try {
      await markHoursCompleteIfNeeded(booking);
    } catch {
      // non-fatal
    }
    const end = sessionEndDate(booking);

    // Hours-complete WhatsApp alarms for both parties (requester picks theirs).
    const hoursPayload = { ...booking.toObject(), hoursCompletedAt: booking.hoursCompletedAt };
    const hoursCompleteCustomerUrl = booking.hoursCompleted
      ? buildHoursCompleteWhatsAppUrl({
          toPhone: booking.customer?.phone,
          booking: hoursPayload,
          cookName: booking.cook?.name,
          cookPhone: booking.cook?.phone,
          customerName: booking.customer?.name,
        })
      : null;
    const hoursCompleteCookUrl = booking.hoursCompleted
      ? buildHoursCompleteWhatsAppUrl({
          toPhone: booking.cook?.phone,
          booking: hoursPayload,
          cookName: booking.cook?.name,
          cookPhone: booking.cook?.phone,
          customerName: booking.customer?.name,
        })
      : null;

    res.json({
      bookingId: booking._id,
      status: booking.status,
      serviceType: booking.serviceType,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      sessionEnd: end ? end.toISOString() : null,
      hoursCompleted: !!booking.hoursCompleted,
      hoursCompletedAt: booking.hoursCompletedAt || null,
      hoursCompleteCustomerUrl,
      hoursCompleteCookUrl,
      address: booking.address,
      amount: booking.amount,
      venue: booking.location?.lat != null ? booking.location : null,
      guests: booking.guests,
      selectedItems: booking.selectedItems,
      cook: { _id: booking.cook?._id, name: booking.cook?.name, phone: booking.cook?.phone },
      customer: { _id: booking.customer?._id, name: booking.customer?.name },
      cookLocation: snapshot,
      cookLiveLocation,
      effectiveCookLocation,
      cookArrived: !!booking.cookArrived,
      cookArrivedAt: booking.cookArrivedAt || null,
      statusHistory: booking.statusHistory,
      updatedAt: booking.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

// Single booking details for the details page. Visible to the customer who
// owns it, the assigned cook, or an admin. Includes live-location context,
// session end, and role-agnostic WhatsApp links.
exports.getBookingById = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("cook", "name email phone")
      .populate("customer", "name email phone");
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    const isCustomer = booking.customer?._id?.toString() === req.user.id;
    const isCook = booking.cook?._id?.toString() === req.user.id;
    const isAdmin = req.user.role === "admin";
    if (!isCustomer && !isCook && !isAdmin) {
      return res.status(403).json({ message: "Not authorized" });
    }

    try {
      await markHoursCompleteIfNeeded(booking);
    } catch {
      // non-fatal
    }

    // 5-minute confirmation windows — expire on read so the customer's
    // waiting and payment pages always poll back a fresh status.
    try {
      await expireBookingIfNeeded(booking);
    } catch {
      // non-fatal
    }
    // NOTE: all three must be declared — `cookLiveLocation` stays null when
    // the cook hasn't shared a live location yet, and reading an undeclared
    // variable below used to throw a ReferenceError that 500'd this endpoint
    // (breaking the customer's waiting-page polling and details page).
    let cookLiveLocation = null;
    let cookRate = null;
    let cookServiceArea = null;
    try {
      const profile = await CookProfile.findOne({ user: booking.cook._id }).select(
        "liveLocation rate serviceArea"
      );
      if (profile?.liveLocation?.lat != null) cookLiveLocation = profile.liveLocation;
      if (profile?.rate != null) cookRate = profile.rate;
      if (profile?.serviceArea) cookServiceArea = profile.serviceArea;
    } catch {
      cookLiveLocation = null;
    }

    const fullObj = booking.toObject ? booking.toObject() : booking;
    // The cook must never see the service-start OTP — they ask the customer
    // for it in person. Customers and admins keep it.
    const obj = isCook ? stripServiceOtp(fullObj) : fullObj;
    const end = sessionEndDate(booking);
    const hoursPayload = { ...obj, hoursCompletedAt: booking.hoursCompletedAt };
    // Submitted review for this service (one per booking max) — visible to
    // the customer who wrote it, the cook who received it, or an admin.
    let bookingReview = null;
    try {
      const Review = require("../models/Review");
      const found = await Review.findOne({ booking: booking._id })
        .populate("customer", "name")
        .select("booking customer rating comment createdAt");
      if (found) bookingReview = found.toObject ? found.toObject() : found;
    } catch {
      bookingReview = null;
    }
    res.json({
      ...obj,
      review: bookingReview,
      sessionEnd: end ? end.toISOString() : null,
      // Post-payment job sheet for the cook (customer name/number/location) —
      // lets the customer re-send their details on WhatsApp from the details
      // page if the automatic share after payment was missed.
      cookWhatsappUrl:
        booking.payment?.status === "paid"
          ? buildCookJobSheetWhatsAppUrl({
              cookPhone: booking.cook?.phone,
              customerName: booking.customer?.name,
              customerPhone: booking.customer?.phone,
              booking: obj,
            })
          : null,
      cookLiveLocation: cookLiveLocation?.lat != null ? cookLiveLocation : null,
      effectiveCookLocation:
        obj.cookLocation?.lat != null
          ? obj.cookLocation
          : cookLiveLocation?.lat != null
            ? cookLiveLocation
            : null,
      cookRate,
      cookServiceArea,
      hoursCompleteCustomerUrl: booking.hoursCompleted
        ? buildHoursCompleteWhatsAppUrl({
            toPhone: booking.customer?.phone,
            booking: hoursPayload,
            cookName: booking.cook?.name,
            cookPhone: booking.cook?.phone,
            customerName: booking.customer?.name,
          })
        : null,
      hoursCompleteCookUrl: booking.hoursCompleted
        ? buildHoursCompleteWhatsAppUrl({
            toPhone: booking.cook?.phone,
            booking: hoursPayload,
            cookName: booking.cook?.name,
            cookPhone: booking.cook?.phone,
            customerName: booking.customer?.name,
          })
        : null,
    });
  } catch (error) {
    next(error);
  }
};

// Customer confirms payment for an ACCEPTED booking within the 5-minute
// window. Demo mode: records a mock gateway id and confirms the booking
// (the Razorpay order/verify flow can be slotted in later without any
// contract change — the frontend calls PATCH /api/bookings/:id/pay either
// way, and `POST /api/payments/verify` remains available for real gateway
// integration).
exports.payBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      customer: req.user.id,
    });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Window elapsed while the customer was on the payment page? Cancel and
    // free the slot instead of taking money.
    await expireBookingIfNeeded(booking);
    if (booking.status === "cancelled" || booking.status === "expired") {
      return res.status(410).json({
        message:
          "Payment window expired — the slot was released. Please book the cook again.",
      });
    }
    if (booking.status !== "accepted") {
      return res.status(400).json({
        message: `This booking is not awaiting payment (status: ${booking.status}).`,
      });
    }
    if (booking.payment?.status === "paid") {
      return res.status(400).json({ message: "This booking is already paid." });
    }

    // Real money only: a booking is confirmed exclusively on a verified
    // Razorpay payment. The old demo path (fabricated pay_demo_* ids) is gone
    // — it marked bookings "paid" without any money moving, poisoning the
    // cook's received-earnings accounting.
    const payment = req.body.payment || {};
    const razorpayOrderId = payment.razorpayOrderId || req.body.razorpayOrderId;
    const razorpayPaymentId = payment.razorpayPaymentId || req.body.razorpayPaymentId;
    const razorpaySignature = payment.razorpaySignature || req.body.razorpaySignature;
    const hasPayment = Boolean(razorpayOrderId && razorpayPaymentId && razorpaySignature);
    if (hasPayment) {
      if (!process.env.RAZORPAY_KEY_SECRET) {
        return res.status(503).json({ message: "Payments cannot be verified right now. Try again later." });
      }
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");
      if (expectedSignature !== razorpaySignature) {
        return res.status(402).json({ message: "Payment verification failed. Please try paying again." });
      }
    }
    // Dev-only test checkout (no real money): allowed solely when the server
    // explicitly opts in via ALLOW_TEST_PAYMENTS=true AND is not running in
    // production. This double-guard means a forgotten env var can never
    // enable fake payments on the live site.
    const allowTest =
      req.body?.testMode === true &&
      process.env.ALLOW_TEST_PAYMENTS === "true" &&
      process.env.NODE_ENV !== "production";
    if (!hasPayment && !allowTest) {
      return res.status(400).json({
        message:
          "Online payment is required — please complete the UPI/card payment to confirm this booking.",
      });
    }
    const method = String(req.body?.method || "upi").toLowerCase();
    const now = new Date();
    booking.payment = {
      status: "paid",
      paidAmount: booking.amount,
      paidAt: now,
      testMode: allowTest,
      ...(allowTest
        ? {
            razorpayOrderId: `order_test_${booking._id.toString().slice(-10)}`,
            razorpayPaymentId: `pay_test_${booking._id.toString().slice(-10)}_${now.getTime()}`,
            razorpaySignature: "test_mode_no_signature",
          }
        : { razorpayOrderId, razorpayPaymentId, razorpaySignature }),
    };
    booking.status = "confirmed";
    booking.statusHistory.push({
      status: "confirmed",
      note: allowTest
        ? `Test payment (no real money) via ${method}`
        : `Payment received via ${method}`,
    });
    await booking.save();

    // Load both parties first — the cook's confirmation notification below
    // carries the full job details (customer, service, guests, venue + pin).
    let cookUser = null;
    let customer = null;
    try {
      [cookUser, customer] = await Promise.all([
        User.findById(booking.cook).select("name phone"),
        User.findById(booking.customer).select("name phone"),
      ]);
    } catch {
      cookUser = null;
      customer = null;
    }

    const trackingUrl = buildTrackingUrl(booking._id);

    // Confirmation alert to the COOK's login: full booking details so the
    // cook can see the job in Notifications without opening the dashboard.
    try {
      const dateLabel = new Date(booking.date).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const serviceLabel = String(booking.serviceType || "").replace(/_/g, " ");
      const venueParts = [
        booking.address || "",
        booking.addressDetails?.flatNo || "",
        booking.addressDetails?.society || "",
        booking.addressDetails?.landmark || "",
        booking.addressDetails?.city || "",
      ]
        .map((p) => String(p).trim())
        .filter(Boolean)
        .join(", ");
      const venuePin =
        booking.location?.lat != null && booking.location?.lng != null
          ? `https://www.google.com/maps?q=${booking.location.lat},${booking.location.lng}`
          : null;
      const detailLines = [
        `Payment received — booking confirmed! ${customer?.name || "A customer"} paid ${booking.payment.testMode ? "(test payment) " : ""}₹${booking.amount}.`,
        `Customer: ${customer?.name || "Customer"}${customer?.phone ? ` (${customer.phone})` : ""}`,
        `Service: ${serviceLabel}`,
        `When: ${dateLabel}, ${booking.startTime}–${booking.endTime}${booking.durationHours ? ` (${booking.durationHours} hrs)` : ""}`,
        booking.guests ? `Guests: ${booking.guests}` : null,
        venueParts ? `Venue: ${venueParts}` : null,
        venuePin ? `Venue pin: ${venuePin}` : null,
        booking.selectedItems?.length ? `Dishes: ${booking.selectedItems.join(", ")}` : null,
        booking.notes ? `Notes: ${booking.notes}` : null,
        `Track: ${trackingUrl}`,
        "Please reach the venue on time.",
      ].filter(Boolean);
      await Notification.create({
        user: booking.cook,
        type: "booking_confirmed",
        message: detailLines.join("\n"),
      });
    } catch {
      // non-fatal: the confirmation itself already succeeded
    }

    // Freshest cook live location at payment time (falls back to the
    // snapshot taken when the cook accepted).
    let cookLoc = booking.cookLocation?.lat != null ? booking.cookLocation : null;
    try {
      const profile = await CookProfile.findOne({ user: booking.cook }).select("liveLocation");
      if (profile?.liveLocation?.lat != null) cookLoc = profile.liveLocation;
    } catch {
      // non-fatal: message says the location will follow once shared
    }

    // 1) Job sheet -> the COOK's WhatsApp (customer name/number/location).
    //    The customer's app opens this right after payment succeeds.
    let cookWhatsappUrl = null;
    try {
      cookWhatsappUrl = buildCookJobSheetWhatsAppUrl({
        cookPhone: cookUser?.phone,
        customerName: customer?.name,
        customerPhone: customer?.phone,
        booking,
        trackingUrl,
      });
    } catch {
      cookWhatsappUrl = null;
    }

    // 2) Confirmation -> the USER's own WhatsApp: payment-received
    //    confirmation, cook's name + number, cook's live location and the
    //    booked service hours.
    let customerWhatsappUrl = null;
    try {
      customerWhatsappUrl = buildCustomerWhatsAppUrl({
        customerPhone: customer?.phone,
        cookName: cookUser?.name,
        cookPhone: cookUser?.phone,
        cookLocation: cookLoc,
        booking,
        trackingUrl,
      });
    } catch {
      customerWhatsappUrl = null;
    }

    // 3) Booking confirmation notification to the user's website account.
    try {
      const dateLabel = new Date(booking.date).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      await Notification.create({
        user: booking.customer,
        type: "booking_confirmed",
        message: `Booking confirmed — payment received! ${
          cookUser?.name || "Your cook"
        } will arrive on ${dateLabel}, ${booking.startTime}–${booking.endTime}.${
          cookUser?.phone ? ` Contact: ${cookUser.phone}` : ""
        }`,
      });
    } catch {
      // non-fatal: the confirmation itself already succeeded
    }

    const obj = booking.toObject ? booking.toObject() : booking;
    res.json({ ...obj, cookWhatsappUrl, customerWhatsappUrl });
  } catch (error) {
    next(error);
  }
};

// Distinct previous service locations for the customer, most recent first.
// Powers the "use previous location" picker on booking forms.
exports.getMyLocations = async (req, res, next) => {
  try {
    const bookings = await Booking.find({ customer: req.user.id })
      .select("address addressDetails location date createdAt")
      .sort({ createdAt: -1 })
      .limit(100);
    const seen = new Map();
    for (const b of bookings) {
      const address = String(b.address || "").trim();
      if (!address) continue;
      const key = address.toLowerCase();
      const hasPin = b.location?.lat != null && b.location?.lng != null;
      if (!seen.has(key)) {
        seen.set(key, {
          address,
          addressDetails: b.addressDetails || {},
          location: hasPin ? { lat: b.location.lat, lng: b.location.lng } : null,
          lastUsed: b.createdAt,
          timesUsed: 1,
        });
      } else {
        const entry = seen.get(key);
        entry.timesUsed += 1;
        // Prefer entries carrying a GPS pin.
        if (hasPin && !entry.location) {
          entry.location = { lat: b.location.lat, lng: b.location.lng };
          entry.addressDetails = b.addressDetails || entry.addressDetails;
        }
      }
      if (seen.size >= 10) break;
    }
    res.json([...seen.values()].slice(0, 10));
  } catch (error) {
    next(error);
  }
};

exports.getAdminBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate("customer", "name email phone")
      .populate("cook", "name email phone")
      .sort({ createdAt: -1 });
    // Lazily expire stale pending requests (requested→expired, accepted
    // unpaid→cancelled) so admins never act on dead rows — the same pass the
    // cook and customer dashboards run before rendering.
    for (const b of bookings) {
      try {
        await expireBookingIfNeeded(b);
      } catch {
        // non-fatal
      }
    }
    // Attach each service's customer rating (one per booking max).
    let reviewByBookingId = {};
    try {
      const Review = require("../models/Review");
      const reviews = await Review.find({
        booking: { $in: bookings.map((b) => b._id) },
      })
        .populate("customer", "name")
        .select("booking customer rating comment createdAt");
      reviewByBookingId = Object.fromEntries(
        reviews.map((r) => [r.booking.toString(), r.toObject ? r.toObject() : r])
      );
    } catch {
      reviewByBookingId = {};
    }
    res.json(
      bookings.map((b) => {
        const obj = b.toObject ? b.toObject() : b;
        return { ...obj, review: reviewByBookingId[b._id.toString()] || null };
      })
    );
  } catch (error) {
    next(error);
  }
};
