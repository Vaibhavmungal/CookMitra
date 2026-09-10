// Standalone regression test for customer reschedule (no deps, no DB).
// Run:  node backend/reschedule.test.js  — exits non-zero on any failure.
//
// Drives the REAL rescheduleBooking controller with in-memory fakes:
// Booking.findById serves one live doc, Availability.find is empty (so the
// engine falls back to the default 08:00–20:00 day), Booking.find serves
// rival bookings for the overlap check, Notification.create logs payloads.

const Booking = require("./models/Booking");
const Availability = require("./models/Availability");
const Notification = require("./models/Notification");
const controller = require("./controllers/bookingController");

let failures = 0;
const check = (name, ok, detail) => {
  console.log((ok ? "PASS" : "FAIL") + "  " + name + (detail ? "  -> " + detail : ""));
  if (!ok) failures++;
};

const p2 = (n) => String(n).padStart(2, "0");
const dayStr = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
const TOMORROW = dayStr(1);
const YESTERDAY = dayStr(-1);

// ── In-memory fakes ─────────────────────────────────────────────────────────
let bookingDoc = null;
let rivals = [];
const notificationLog = [];

const resetBooking = (overrides = {}) => {
  const at = (h, m) => new Date();
  bookingDoc = {
    _id: "booking1",
    cook: "cook1",
    customer: "cust1",
    serviceType: "cook_with_me",
    date: new Date(TOMORROW + "T00:00:00"),
    startTime: "10:00",
    endTime: "13:00",
    durationHours: 3,
    status: "confirmed",
    statusHistory: [],
    ...overrides,
    save: async function () {
      return this;
    },
  };
};

Booking.findById = async (id) => (String(id) === "booking1" ? bookingDoc : null);
// No published windows -> default full service day via getDayWindows.
Availability.find = () => ({ sort: async () => [] });
// Rival bookings for the overlap check.
Booking.find = () => ({ select: async () => rivals });
Notification.create = async (payload) => {
  notificationLog.push(payload);
  return payload;
};

const call = (userId, body) => {
  const req = { params: { id: "booking1" }, user: { id: userId }, body };
  let status = 200;
  let payload = null;
  const res = {
    status: (s) => {
      status = s;
      return res;
    },
    json: (p) => {
      payload = p;
      return res;
    },
  };
  return controller
    .rescheduleBooking(req, res, (e) => {
      throw e;
    })
    .then(() => ({ status, payload }));
};

(async () => {
  // 1) Happy path: confirmed 3h booking moves 10:00 -> 14:00 tomorrow.
  resetBooking();
  rivals = [];
  notificationLog.length = 0;
  let r = await call("cust1", { date: TOMORROW, startTime: "14:00" });
  check("move succeeds", r.status === 200, "s=" + r.status);
  check("date/start/end updated", bookingDoc.startTime === "14:00" && bookingDoc.endTime === "17:00", bookingDoc.startTime + "-" + bookingDoc.endTime);
  check(
    "history records the move",
    bookingDoc.statusHistory.some((h) => String(h.note || "").startsWith("Rescheduled")),
    JSON.stringify(bookingDoc.statusHistory.map((h) => h.note))
  );
  const types = notificationLog.map((n) => n.type);
  check("cook notified", notificationLog.some((n) => String(n.user) === "cook1" && n.type === "booking_rescheduled"), types.join(","));
  check("customer confirmed", notificationLog.some((n) => String(n.user) === "cust1" && n.type === "booking_rescheduled"), types.join(","));

  // 2) Overlap with another active booking -> 409.
  resetBooking();
  rivals = [{ _id: "rival1", startTime: "15:00", endTime: "18:00", status: "accepted" }];
  notificationLog.length = 0;
  r = await call("cust1", { date: TOMORROW, startTime: "14:00" });
  check("clash refused with 409", r.status === 409, "s=" + r.status + " " + JSON.stringify(r.payload));

  // 3) Stranger (not the customer) -> 403.
  resetBooking();
  rivals = [];
  r = await call("stranger", { date: TOMORROW, startTime: "14:00" });
  check("non-customer refused with 403", r.status === 403, "s=" + r.status);

  // 4) Completed booking cannot move -> 400.
  resetBooking({ status: "completed" });
  r = await call("cust1", { date: TOMORROW, startTime: "14:00" });
  check("completed refused with 400", r.status === 400, "s=" + r.status);

  // 5) Outside the 08:00–20:00 service day -> 400.
  resetBooking();
  r = await call("cust1", { date: TOMORROW, startTime: "06:00" });
  check("off-hours refused with 400", r.status === 400, "s=" + r.status);

  // 6) Past date -> 400.
  resetBooking();
  r = await call("cust1", { date: YESTERDAY, startTime: "10:00" });
  check("past date refused with 400", r.status === 400, "s=" + r.status);

  // 7) Missing booking -> 404.
  resetBooking();
  bookingDoc = null;
  r = await call("cust1", { date: TOMORROW, startTime: "10:00" });
  check("unknown booking 404", r.status === 404, "s=" + r.status);

  console.log(failures === 0 ? "ALL TESTS PASSED" : failures + " FAILURES");
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
