export const SERVICE_DETAILS = {
  cook_for_me: {
    label: "Cook for Me",
    description: "Sit back and host your guests while our expert cook handles full meal preparation at your kitchen.",
    icon: "ChefHat",
    badgeColor: "#FFF7ED",
    textColor: "#C2410C",
  },
  cook_with_me: {
    label: "Cook With Me",
    description: "Team up with an experienced home chef to prepare traditional sweets and savories together.",
    icon: "Users",
    badgeColor: "#F0FDF4",
    textColor: "#15803D",
  },
  teach_me: {
    label: "Teach Me",
    description: "Learn time-honored techniques, family secrets, and proper consistency for intricate festive dishes.",
    icon: "GraduationCap",
    badgeColor: "#EFF6FF",
    textColor: "#1D4ED8",
  },
  preparation_help: {
    label: "Preparation Help",
    description: "Get dedicated assistance with dough kneading, chakli pressing, modak shaping, and deep frying.",
    icon: "HandHelping",
    badgeColor: "#FAF5FF",
    textColor: "#7E22CE",
  },
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

// Local "today" as YYYY-MM-DD for date-picker defaults / mins.
// toISOString() is UTC and leaks the wrong day between 00:00–05:29 IST.
export const localTodayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Local "tomorrow" as YYYY-MM-DD for date-picker mins / defaults.
export const localTomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Google Maps navigation URL for a booking: precise GPS pin when
// available, otherwise falls back to the text address search.
export const mapsNavigateUrl = (booking) => {
  const lat = booking?.location?.lat;
  const lng = booking?.location?.lng;
  if (typeof lat === "number" && typeof lng === "number") {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  if (booking?.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      booking.address
    )}`;
  }
  return null;
};

// Normalize an Indian mobile number to 10 digits (or null if invalid)
export const normalizeIndianMobile = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) return digits;
  return null;
};

// Build a wa.me deep link that sends the order details + the cook's live
// location to the USER's own WhatsApp. Returns null when the user has no
// valid number. After cook ACCEPTS, this is the booked confirmation with
// cook name, cook number, live tracking link + cook live location.
export const bookingCustomerWhatsAppUrl = ({ customerPhone, cookName, cookPhone, cookLocation, booking, trackingUrl }) => {
  const mobile = normalizeIndianMobile(customerPhone);
  if (!mobile) return null;

  const cookMapsLink =
    cookLocation?.lat != null && cookLocation?.lng != null
      ? `https://www.google.com/maps?q=${cookLocation.lat},${cookLocation.lng}`
      : null;

  const venueMapsLink =
    booking?.location?.lat != null && booking?.location?.lng != null
      ? `https://www.google.com/maps?q=${booking.location.lat},${booking.location.lng}`
      : null;

  const isConfirmed = ["accepted", "confirmed", "in_progress"].includes(booking?.status);
  const isPaid = booking?.payment?.status === "paid";
  const header = isPaid
    ? "Cook Mitra Booking Confirmed — Payment Received ✅"
    : isConfirmed
      ? "Cook Mitra Booking Confirmed – Cook Accepted 🎉"
      : "Cook Mitra Booking Confirmation";
  const trackLink =
    trackingUrl ||
    (booking?._id && typeof window !== "undefined"
      ? `${window.location.origin}/track/${booking._id}`
      : null);

  const lines = [
    header,
    `Service: ${(booking?.serviceType || "").replace(/_/g, " ")}`,
    `Cook: ${cookName || "Assigned cook"}`,
    `Cook's number: ${cookPhone || "will be shared shortly"}`,
    `Date: ${booking?.date ? new Date(booking.date).toLocaleDateString() : ""}`,
    `Service hours: ${booking?.startTime || ""} - ${booking?.endTime || ""}${booking?.durationHours ? ` (${booking.durationHours} hrs)` : ""}`,
    `Venue: ${booking?.address || ""}`,
  ];
  if (trackLink) lines.push(`Live tracking link: ${trackLink}`);
  if (venueMapsLink) lines.push(`Your venue pin: ${venueMapsLink}`);
  if (cookMapsLink) {
    lines.push(`Cook's live location: ${cookMapsLink}`);
  } else {
    lines.push("Cook's live location: will be shared here once the cook is on the way.");
  }
  if (booking?.guests) lines.push(`Guests: ${booking.guests}`);
  if (booking?.durationHours) lines.push(`Duration: ${booking.durationHours} hrs`);
  if (booking?.selectedItems?.length) lines.push(`Dishes: ${booking.selectedItems.join(", ")}`);
  if (booking?.notes) lines.push(`Notes: ${booking.notes}`);
  if (booking?._id) lines.push(`Booking ID: ${booking._id}`);
  if (booking?.status) lines.push(`Status: ${String(booking.status).toUpperCase()}`);

  return `https://wa.me/91${mobile}?text=${encodeURIComponent(lines.join("\n"))}`;
};

// wa.me "service complete — please rate your cook" reminder for the
// customer's own WhatsApp, with a link to the booking review page.
export const bookingReviewWhatsAppUrl = ({ customerPhone, cookName, booking, reviewUrl }) => {
  const mobile = normalizeIndianMobile(customerPhone);
  if (!mobile) return null;

  const link =
    reviewUrl ||
    (booking?._id && typeof window !== "undefined"
      ? `${window.location.origin}/bookings/${booking._id}`
      : null);

  const lines = [
    "Cook Mitra: How was your meal? Please rate your cook ⭐",
    `Cook: ${cookName || "Your cook"}`,
    `Service: ${(booking?.serviceType || "").replace(/_/g, " ")}`,
    `Date: ${booking?.date ? new Date(booking.date).toLocaleDateString() : ""}`,
  ];
  if (booking?._id) lines.push(`Booking ID: ${booking._id}`);
  if (link) lines.push(`Rate here: ${link}`);
  lines.push("Your rating helps other households find great cooks. Thank you!");

  return `https://wa.me/91${mobile}?text=${encodeURIComponent(lines.join("\n"))}`;
};

// Google Maps link for a cook's live location (or null when not shared yet)
export const cookLiveMapsUrl = (cookLocation) => {
  if (cookLocation?.lat == null || cookLocation?.lng == null) return null;
  return `https://www.google.com/maps?q=${cookLocation.lat},${cookLocation.lng}`;
};

// Session end datetime from date + endTime ("HH:MM"). Null when unknown.
// Accepts either a booking ({date,endTime}) or live payload ({date,endTime}).
export const sessionEndDate = (obj) => {
  const date = obj?.sessionEnd || obj?.date;
  if (!date) return null;
  if (obj?.sessionEnd && !obj?.endTime) return new Date(obj.sessionEnd);
  const endTime = obj?.endTime;
  if (!endTime) return null;
  const m = String(endTime).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
};

// Human countdown: "2h 15m left" / "Overdue by 10m" / null when unknown
export const formatRemaining = (endDate, now = Date.now()) => {
  if (!endDate || Number.isNaN(endDate.getTime())) return null;
  const diff = endDate.getTime() - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  const label = h > 0 ? `${h}h ${m}m` : `${m} min`;
  return diff >= 0 ? `${label} left` : `Overdue by ${label}`;
};

// Short audible alarm (3 beeps via Web Audio, no assets). Resolves when done.
// Browsers may block audio before user interaction — callers must try/catch.
export const playAlarmSound = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const times = [0, 0.35, 0.7];
    times.forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = i === 2 ? 880 : 660;
      const start = ctx.currentTime + t;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    // silent fallback: visual banner + toast still notify
  }
};

// wa.me "cooking hours complete" alarm for EITHER party's own WhatsApp.
// Pass the recipient's phone as toPhone. Null for invalid numbers.
export const hoursCompleteWhatsAppUrl = ({ toPhone, booking, cookName, cookPhone, customerName }) => {
  const mobile = normalizeIndianMobile(toPhone);
  if (!mobile) return null;

  const dateStr = booking?.date ? new Date(booking.date).toLocaleDateString() : "";
  const endStr = booking?.endTime || "";
  const completedAt = booking?.hoursCompletedAt ? new Date(booking.hoursCompletedAt).toLocaleString() : "";

  const lines = [
    "Cook Mitra: Cooking Hours Complete",
    `Service: ${(booking?.serviceType || "").replace(/_/g, " ")}`,
    `Cook: ${cookName || "Assigned cook"}${cookPhone ? ` (${cookPhone})` : ""}`,
    `Customer: ${customerName || "Customer"}`,
    `Date: ${dateStr}${endStr ? ` | Ended at: ${endStr}` : ""}`,
    `Venue: ${booking?.address || ""}`,
  ];
  const bid = booking?._id || booking?.bookingId;
  if (bid) lines.push(`Booking ID: ${bid}`);
  if (completedAt) lines.push(`Completed at: ${completedAt}`);
  lines.push("Your booked cooking hours are complete. Please review your session!");

  return `https://wa.me/91${mobile}?text=${encodeURIComponent(lines.join("\n"))}`;
};

// Haversine distance in km between two {lat,lng} points (null when unknown)
export const distanceKm = (a, b) => {
  if (a?.lat == null || a?.lng == null || b?.lat == null || b?.lng == null) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa =
    s1 * s1 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.asin(Math.sqrt(aa));
};

// Human "x min ago" for ISO dates
export const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// OpenStreetMap embed URL (no API key) showing cook + venue pins.
// OSM embed supports a single marker param, so we center on the midpoint and
// mark the cook position; venue is listed alongside with its own link.
export const osmEmbedUrl = (cookLoc, venueLoc) => {
  const pts = [cookLoc, venueLoc].filter((p) => p?.lat != null && p?.lng != null);
  if (!pts.length) return null;
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const pad = 0.02;
  const bbox = `${Math.min(...lngs) - pad},${Math.min(...lats) - pad},${Math.max(...lngs) + pad},${Math.max(...lats) + pad}`;
  const mark = cookLoc?.lat != null ? cookLoc : venueLoc;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${mark.lat},${mark.lng}`;
};

// Build a wa.me deep link that shares full order details + live location
// with the cook on WhatsApp. Returns null when the cook has no valid number.
export const bookingWhatsAppUrl = ({ cookPhone, customerName, customerPhone, booking }) => {
  const mobile = normalizeIndianMobile(cookPhone);
  if (!mobile) return null;

  const mapsLink =
    booking?.location?.lat != null && booking?.location?.lng != null
      ? `https://www.google.com/maps?q=${booking.location.lat},${booking.location.lng}`
      : null;

  const lines = [
    "New Cook Mitra Booking Request",
    `Customer: ${customerName || "Customer"}${customerPhone ? ` (${customerPhone})` : ""}`,
    `Service: ${(booking?.serviceType || "").replace(/_/g, " ")}`,
    `Date: ${booking?.date ? new Date(booking.date).toLocaleDateString() : ""} | Time: ${booking?.startTime || ""} - ${booking?.endTime || ""}`,
    `Venue: ${booking?.address || ""}`,
  ];
  if (mapsLink) lines.push(`Live location: ${mapsLink}`);
  if (booking?.guests) lines.push(`Guests: ${booking.guests}`);
  if (booking?.durationHours) lines.push(`Duration: ${booking.durationHours} hrs`);
  if (booking?.selectedItems?.length) lines.push(`Dishes: ${booking.selectedItems.join(", ")}`);
  if (booking?.notes) lines.push(`Notes: ${booking.notes}`);
  if (booking?._id) lines.push(`Booking ID: ${booking._id}`);
  lines.push("Please accept it in your Cook Dashboard.");

  return `https://wa.me/91${mobile}?text=${encodeURIComponent(lines.join("\n"))}`;
};

// Client mirror of the backend `buildCookJobSheetWhatsAppUrl`: wa.me deep link
// targeting the COOK's WhatsApp with the post-payment job sheet — customer
// name, phone number and venue location (address + GPS pin). Used as the
// fallback when a server response didn't include `cookWhatsappUrl`. Returns
// null when the cook has no valid number.
export const bookingCookJobWhatsAppUrl = ({ cookPhone, customerName, customerPhone, booking, trackingUrl }) => {
  const mobile = normalizeIndianMobile(cookPhone);
  if (!mobile) return null;

  const mapsLink =
    booking?.location?.lat != null && booking?.location?.lng != null
      ? `https://www.google.com/maps?q=${booking.location.lat},${booking.location.lng}`
      : null;

  const addressParts = [
    booking?.address || "",
    booking?.addressDetails?.flatNo || "",
    booking?.addressDetails?.society || "",
    booking?.addressDetails?.landmark || "",
    booking?.addressDetails?.city || "",
  ]
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(", ");

  const trackLink =
    trackingUrl || (booking?._id ? `${window.location.origin}/track/${booking._id}` : null);

  const lines = [
    "*Cook Mitra: Payment Received — Job Confirmed* ✅",
    `Customer: ${customerName || "Customer"}`,
    `Customer number: ${customerPhone || "not shared"}`,
    `Service: ${(booking?.serviceType || "").replace(/_/g, " ")}`,
    `Date: ${booking?.date ? new Date(booking.date).toLocaleDateString() : ""} | Time: ${booking?.startTime || ""} - ${booking?.endTime || ""}`,
    `Venue: ${addressParts || booking?.address || ""}`,
  ];
  if (mapsLink) lines.push(`Location pin: ${mapsLink}`);
  if (booking?.guests) lines.push(`Guests: ${booking.guests}`);
  if (booking?.durationHours) lines.push(`Duration: ${booking.durationHours} hrs`);
  if (booking?.selectedItems?.length) lines.push(`Dishes: ${booking.selectedItems.join(", ")}`);
  if (booking?.notes) lines.push(`Notes: ${booking.notes}`);
  if (booking?._id) lines.push(`Booking ID: ${booking._id}`);
  if (trackLink) lines.push(`Live tracking: ${trackLink}`);
  lines.push("The customer has PAID. Please reach the venue on time.");

  return `https://wa.me/91${mobile}?text=${encodeURIComponent(lines.join("\n"))}`;
};
