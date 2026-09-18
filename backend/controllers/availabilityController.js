const Availability = require("../models/Availability");
const CookProfile = require("../models/CookProfile");
const { getDayWindows, getDayBookings, computeStartOptions, suggestDurations, parseDay, resolveCookAvailability, timeToMinutes, findContainingWindow, findOverlapBooking } = require("../utils/slots");

exports.getAvailability = async (req, res, next) => {
  try {
    const { date, durationHours, startTime, endTime } = req.query;

    // Accept either a User id or a CookProfile id — Availability.cook stores
    // the user id, so a bare profile id would otherwise match nothing and
    // every slot search would come back empty ("no slots").
    let cookId = req.params.cookId;
    let profile = null;
    try {
      profile = await CookProfile.findById(cookId).select(
        "user availabilityStatus unavailableDate"
      );
      if (profile?.user) cookId = profile.user.toString();
    } catch {
      // not a profile id — use the param as a user id
    }
    if (!profile) {
      profile = await CookProfile.findOne({ user: cookId }).select(
        "availabilityStatus unavailableDate"
      );
    }
    // A cook who has toggled "unavailable" exposes no slots until they flip
    // back or the next day begins.
    if (profile && !(await resolveCookAvailability(profile))) {
      return res.json([]);
    }

    const filter = { cook: cookId, status: "available" };
    if (date) {
      // parseDay normalizes "YYYY-MM-DD" to LOCAL midnight, matching how
      // slots are stored (new Date("YYYY-MM-DD") alone is UTC midnight and
      // lands on the wrong local day on non-UTC servers).
      const start = parseDay(date);
      if (!start || Number.isNaN(start.getTime())) {
        return res.status(400).json({ message: "Invalid date" });
      }
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const slots = await Availability.find(filter).sort({ date: 1, startTime: 1 });

    // Duration-aware mode: derive bookable start times sized to the input
    // service hours (open windows minus already-booked intervals).
    // Exact-window mode (?startTime=&endTime=): answer whether that single
    // interval is free — { free, reason } — so the booking flow can
    // double-check a slot before creating the request.
    const dur = durationHours != null && durationHours !== "" ? Number(durationHours) : null;
    if ((dur != null || startTime != null || endTime != null) && date) {
      if (dur != null && (!Number.isFinite(dur) || dur < 0.5 || dur > 12)) {
        return res.status(400).json({ message: "durationHours must be between 0.5 and 12" });
      }
      // No published windows → the cook's whole day is open by default.
      const windows = slots.length ? slots : await getDayWindows(cookId, date);
      const bookings = await getDayBookings(cookId, date);
      if (startTime != null || endTime != null) {
        if (!startTime || !endTime) {
          return res.status(400).json({ message: "startTime and endTime are both required" });
        }
        const sMin = timeToMinutes(String(startTime));
        const eMin = timeToMinutes(String(endTime));
        if (sMin == null || eMin == null || eMin <= sMin) {
          return res.status(400).json({ message: "Invalid time slot" });
        }
        if (!findContainingWindow(windows, String(startTime), String(endTime))) {
          return res.json({ free: false, reason: "Cook is not available for the selected time" });
        }
        if (findOverlapBooking(bookings, String(startTime), String(endTime))) {
          return res.json({ free: false, reason: "This time is already booked. Please pick another start time." });
        }
        return res.json({ free: true });
      }
      if (dur == null) {
        // Exact-window-only query already returned above; without a duration
        // there are no start options to derive — fall through to raw slots.
        return res.json(slots);
      }
      const options = computeStartOptions(windows, bookings, dur);
      const shaped = options.map((o) => ({ _id: `${o.startTime}-${o.endTime}`, ...o, derived: true }));
      // Opt-in recovery hint: when nothing fits, name shorter session lengths
      // that DO fit (computed from the same in-memory windows — no extra
      // queries) so the client can offer one-tap retries. Shape is unchanged
      // unless suggest=1 is passed.
      if (req.query.suggest === "1" || req.query.suggest === "true") {
        const suggestions = options.length ? [] : suggestDurations(windows, bookings, dur);
        return res.json({ slots: shaped, suggestions });
      }
      return res.json(shaped);
    }

    res.json(slots);
  } catch (error) {
    next(error);
  }
};

exports.setAvailability = async (req, res, next) => {
  try {
    const { date, startTime, endTime } = req.body;

    const day = parseDay(date);
    if (!day || Number.isNaN(day.getTime())) {
      return res.status(400).json({ message: "Valid date is required" });
    }
    const sMin = timeToMinutes(startTime);
    const eMin = timeToMinutes(endTime);
    if (sMin == null || eMin == null || eMin <= sMin) {
      return res.status(400).json({ message: "End time must be after start time" });
    }
    // Overlap check, not exact-match: a stored 09:00–12:00 window must also
    // block a new 10:00–11:00 window (and vice versa), not just an identical
    // start time.
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    const sameDay = await Availability.find({
      cook: req.user.id,
      date: { $gte: dayStart, $lte: dayEnd },
    }).select("startTime endTime");
    const clash = (sameDay || []).some((s) => {
      const rs = timeToMinutes(s.startTime);
      const re = timeToMinutes(s.endTime);
      return rs != null && re != null && sMin < re && rs < eMin;
    });
    if (clash) {
      return res.status(400).json({ message: "This overlaps an existing slot" });
    }

    const slot = await Availability.create({
      cook: req.user.id,
      date: day,
      startTime,
      endTime,
    });
    res.status(201).json(slot);
  } catch (error) {
    next(error);
  }
};

exports.getMySlots = async (req, res, next) => {
  try {
    const slots = await Availability.find({ cook: req.user.id }).sort({
      date: 1,
      startTime: 1,
    });
    res.json(slots);
  } catch (error) {
    next(error);
  }
};

exports.removeAvailability = async (req, res, next) => {
  try {
    const slot = await Availability.findOneAndDelete({
      _id: req.params.id,
      cook: req.user.id,
    });
    if (!slot) {
      return res.status(404).json({ message: "Slot not found" });
    }
    res.json({ message: "Slot removed" });
  } catch (error) {
    next(error);
  }
};
