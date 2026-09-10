const Availability = require("../models/Availability");
const CookProfile = require("../models/CookProfile");
const { getDayWindows, getDayBookings, computeStartOptions, suggestDurations, parseDay, resolveCookAvailability } = require("../utils/slots");

exports.getAvailability = async (req, res, next) => {
  try {
    const { date, durationHours } = req.query;

    // A cook who has toggled "unavailable" exposes no slots until they flip
    // back or the next day begins.
    const profile = await CookProfile.findOne({ user: req.params.cookId }).select(
      "availabilityStatus unavailableDate"
    );
    if (profile && !(await resolveCookAvailability(profile))) {
      return res.json([]);
    }

    const filter = { cook: req.params.cookId, status: "available" };
    if (date) {
      // parseDay normalizes "YYYY-MM-DD" to LOCAL midnight, matching how
      // slots are stored (new Date("YYYY-MM-DD") alone is UTC midnight and
      // lands on the wrong local day on non-UTC servers).
      const start = parseDay(date);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      filter.date = { $gte: start, $lte: end };
    }

    const slots = await Availability.find(filter).sort({ date: 1, startTime: 1 });

    // Duration-aware mode: derive bookable start times sized to the input
    // service hours (open windows minus already-booked intervals).
    const dur = durationHours != null && durationHours !== "" ? Number(durationHours) : null;
    if (dur != null && date) {
      if (!Number.isFinite(dur) || dur < 0.5 || dur > 12) {
        return res.status(400).json({ message: "durationHours must be between 0.5 and 12" });
      }
      // No published windows → the cook's whole day is open by default.
      const windows = slots.length ? slots : await getDayWindows(req.params.cookId, date);
      const bookings = await getDayBookings(req.params.cookId, date);
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
    const existing = await Availability.findOne({
      cook: req.user.id,
      date: day,
      startTime,
    });
    if (existing) {
      return res.status(400).json({ message: "Slot already exists" });
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
