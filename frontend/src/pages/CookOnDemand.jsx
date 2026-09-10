import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ChefHat,
  Users,
  GraduationCap,
  HandHelping,
  CalendarCheck,
  MapPin,
  UtensilsCrossed,
  StickyNote,
  LogIn,
  Check,
  CheckCircle2,
  Clock3,
  Building2,
  Landmark,
  Home as HomeIcon,
  MessageCircle,
  History,
  ArrowRight,
  Minus,
  Plus,
} from "lucide-react";
import API from "../api/axios";
import { formatCurrency, localTodayStr, localTomorrowStr, slabPriceForDuration } from "../utils/constants";
import CouponApply from "../components/CouponApply";
import { resolveFileUrl } from "../components/CookDocUploads";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useLocation as useSiteLocation } from "../context/LocationContext";
import { saveBookingDraft, loadBookingDraft, clearBookingDraft } from "../utils/bookingDraft";

import LoginPromptModal from "../components/LoginPromptModal";

const SERVICE_OPTIONS = [
  { id: "cook_for_me", label: "Cook for Me", desc: "Cook prepares food at your home", icon: <ChefHat size={24} /> },
  { id: "cook_with_me", label: "Cook With Me", desc: "Prepare together, learn as you go", icon: <Users size={24} /> },
  { id: "teach_me", label: "Teach Me", desc: "Hands-on lesson in festive cooking", icon: <GraduationCap size={24} /> },
  { id: "preparation_help", label: "Preparation Help", desc: "Help with chopping, dough, frying", icon: <HandHelping size={24} /> },
];

// One-tap hour presets — the most common booking lengths. Exact values
// (0.5 steps, 1–12) can still be typed in the input below the chips.
const DURATION_QUICK = [1, 2, 3, 4];

// Service day: bookable slots run 08:00–20:00 for every cook (mirrors the
// backend slot engine in backend/utils/slots.js — defense in depth so an
// out-of-hours slot can never be displayed even if the API ever returns one).
const SERVICE_START_MIN = 8 * 60;
const SERVICE_END_MIN = 20 * 60;

const toMinutes = (t) => {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
};

// "8:00 AM – 11:00 AM" style label for a "HH:MM" slot.
const fmtTime = (t) => {
  const m = toMinutes(t);
  if (m == null) return t;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
};

const isSlotInServiceDay = (slot) => {
  const s = toMinutes(slot.startTime);
  const e = toMinutes(slot.endTime);
  return s != null && e != null && s >= SERVICE_START_MIN && e <= SERVICE_END_MIN;
};

// Slots starting at or before "now" are hidden when the selected date is
// today — a customer can never pick a time that already passed.
const isSlotInPast = (dateStr, startTime) => {
  if (dateStr !== localTodayStr()) return false;
  const s = toMinutes(startTime);
  if (s == null) return false;
  const now = new Date();
  return s <= now.getHours() * 60 + now.getMinutes();
};

// Friendly date label for summaries ("Today" / "Tomorrow" / 2026-09-12).
const dateLabel = (dateStr) => {
  if (!dateStr) return "Pick a date";
  if (dateStr === localTodayStr()) return "Today";
  if (dateStr === localTomorrowStr()) return "Tomorrow";
  return dateStr;
};

// Numbered section heading — the form reads as 4 short steps.
const SecTitle = ({ n, icon, children }) => (
  <h3 className="ondemand-section-title">
    <span className="od-sec-num" aria-hidden="true">{n}</span>
    {icon}
    <span>{children}</span>
  </h3>
);

// Compact recap of the step-1 choices with a one-tap way back to edit.
const SummaryBar = ({ form, serviceLabel, onEdit }) => (
  <div className="od-sumbar">
    <div className="od-sumchips" aria-live="polite">
      <span className="od-sumchip">{serviceLabel}</span>
      <span className="od-sumchip">{dateLabel(form.date)}</span>
      <span className="od-sumchip">{form.durationHours || "–"} hr</span>
      <span className="od-sumchip">{form.guests || "–"} guests</span>
      <span className={`od-sumchip ${form.city.trim() ? "" : "od-missing"}`}>
        {form.city.trim() || "Area missing"}
      </span>
    </div>
    <button type="button" className="btn btn-outline btn-sm" onClick={onEdit}>
      Edit
    </button>
  </div>
);

const CookOnDemand = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { location: siteLocation } = useSiteLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Deep links (Home services, Footer) may preselect the service via
  // ?serviceType= — fall back to the default for anything unknown.
  const initialService = (() => {
    const q = searchParams.get("serviceType");
    return SERVICE_OPTIONS.some((s) => s.id === q) ? q : "cook_with_me";
  })();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    serviceType: initialService,
    date: localTomorrowStr(),
    flatNo: "",
    society: "",
    landmark: "",
    city: "",
    guests: "4",
    durationHours: "3",
    customDishes: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(null);
  const [locMsg, setLocMsg] = useState("");
  const [coords, setCoords] = useState(null);
  const [copied, setCopied] = useState(false);
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedIdx, setSavedIdx] = useState("");
  const autoFilled = useRef(false);
  const venueErrorRef = useRef(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const scrollToVenueError = () =>
    requestAnimationFrame(() =>
      venueErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  // Step 2 (time slots): one entry per distinct start–end time with the
  // number of cooks free at it. Step 3 (cook) shows cooks free at the slot
  // the customer picked in step 2.
  const [slotOptions, setSlotOptions] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [coupon, setCoupon] = useState(null);
  // Shorter session lengths the server confirmed free when the requested
  // hours fit nowhere — rendered as one-tap retry chips.
  const [slotSuggestions, setSlotSuggestions] = useState([]);

  // Header-detected place (GPS / IP / manual) pre-fills address fields when
  // they are still empty — typed or previously-saved input always wins.
  useEffect(() => {
    if (!siteLocation?.city && !siteLocation?.area && !siteLocation?.state) return;
    setForm((f) => {
      if (f.flatNo || f.society || f.landmark || f.city) return f;
      return {
        ...f,
        city: f.city.trim() ? f.city : siteLocation.city || "",
        society: f.society.trim() ? f.society : siteLocation.area || "",
        landmark: f.landmark.trim() ? f.landmark : siteLocation.street || siteLocation.area || "",
      };
    });
    if (Number.isFinite(siteLocation?.lat) && Number.isFinite(siteLocation?.lng)) {
      setCoords((c) => c || { lat: siteLocation.lat, lng: siteLocation.lng });
    }
  }, [siteLocation?.city, siteLocation?.area, siteLocation?.state, siteLocation?.street, siteLocation?.lat, siteLocation?.lng]);

  // Previous locations of this customer for one-tap reuse (customers only).
  useEffect(() => {
    if (user?.role !== "customer") return;
    let cancelled = false;
    API.get("/bookings/my/locations")
      .then((res) => {
        if (!cancelled) setSavedLocations(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setSavedLocations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  const applySavedLocation = (idx) => {
    const saved = savedLocations[Number(idx)];
    if (!saved) return;
    const d = saved.addressDetails || {};
    // Explicit pick always replaces the auto-filled address block (header
    // detection or a previously applied entry) — the saved entry is
    // authoritative. Entries without structured details fall back to parsing
    // their address string.
    const parts = String(saved.address || "").split(",").map((p) => p.trim()).filter(Boolean);
    const src = Object.keys(d).length > 0
      ? d
      : parts.length === 1
        ? { society: parts[0] }
        : parts.length === 2
          ? { flatNo: parts[0], society: parts[1] }
          : { flatNo: parts[0], society: parts.slice(1, -1).join(", "), city: parts[parts.length - 1] };
    setForm((f) => ({
      ...f,
      flatNo: src.flatNo || "",
      society: src.society || "",
      landmark: src.landmark || "",
      city: src.city || "",
    }));
    setSavedIdx(String(idx));
    if (saved.location?.lat != null) {
      setCoords({ lat: saved.location.lat, lng: saved.location.lng });
      setLocMsg("Previous location applied with its saved map pin");
    } else {
      // Drop any stale pin from the auto-detected location — it would
      // point at the wrong place for this address.
      setCoords(null);
      setLocMsg("Previous location applied — verify the address below for precise navigation");
    }
  };

  // Existing customers: auto-fill the most recent previous address on load
  // (only when the address fields are still untouched).
  useEffect(() => {
    if (autoFilled.current || savedLocations.length === 0) return;
    autoFilled.current = true;
    setForm((f) => {
      if (f.flatNo || f.society || f.landmark || f.city) return f;
      const d = savedLocations[0].addressDetails || {};
      return {
        ...f,
        flatNo: d.flatNo || "",
        society: d.society || "",
        landmark: d.landmark || "",
        city: d.city || "",
      };
    });
    setSavedIdx("0");
    if (savedLocations[0].location?.lat != null) {
      setCoords({ lat: savedLocations[0].location.lat, lng: savedLocations[0].location.lng });
    }
  }, [savedLocations]);

  const mapsLink = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : "";

  const serviceLabel =
    (SERVICE_OPTIONS.find((s) => s.id === form.serviceType) || {}).label || "Cook service";

  // Launch slab pricing (server recomputes it — display + preview only).
  const slab = slabPriceForDuration(Number(form.durationHours));
  const couponDiscount = slab != null && coupon ? Math.min(coupon.discount, slab) : 0;
  const finalPayable = slab != null ? Math.max(0, slab - couponDiscount) : 0;

  // Returning from login with an unfinished booking: restore the filled
  // form + pin, re-check live availability, and land where they left off —
  // step 3 when the picked slot is still free, else step 2 with fresh
  // slots. Runs once; stale drafts (>2h) are dropped silently.
  const resumedDraft = useRef(false);
  useEffect(() => {
    if (resumedDraft.current || !user) return;
    const d = loadBookingDraft();
    if (!d || d.kind !== "on-demand" || !d.form) return;
    if (!d.savedAt || Date.now() - d.savedAt > 2 * 3600 * 1000) {
      clearBookingDraft();
      return;
    }
    resumedDraft.current = true;
    autoFilled.current = true;
    setForm((f) => ({ ...f, ...d.form }));
    if (d.coords?.lat != null) setCoords(d.coords);
    setSearching(true);
    (async () => {
      try {
        const r = await runSlotSearch({
          serviceType: d.form.serviceType,
          date: d.form.date,
          durationHours: d.form.durationHours,
        });
        setMatches(r.available);
        setSlotOptions(r.options);
        setSlotSuggestions(r.suggestions);
        setSearched(true);
        const stillFree =
          d.selectedSlot &&
          r.options.some(
            (o) =>
              o.startTime === d.selectedSlot.startTime &&
              o.endTime === d.selectedSlot.endTime
          );
        if (stillFree) {
          setSelectedSlot(d.selectedSlot);
          setStep(3);
          showToast("Welcome back — your booking is restored. Just tap Book.", "success");
        } else {
          setSelectedSlot(null);
          setStep(2);
          showToast("Welcome back — pick a time to continue your booking.", "success");
        }
        clearBookingDraft();
      } catch {
        setStep(1);
        showToast("Welcome back — your details were restored. Tap See Time Slots.", "info");
      } finally {
        setSearching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleCopyLink = async () => {
    if (!mapsLink) return;
    try {
      await navigator.clipboard.writeText(mapsLink);
    } catch {
      const input = document.getElementById("maps-link-input");
      if (input) {
        input.select();
        document.execCommand("copy");
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Stepper helper for duration / guests: snaps to `step`, clamps to
  // [min, max]. Empty or invalid input restarts from min so −/+ always work.
  const adjustNumber = (name, delta, { min, max, step }) => {
    setForm((f) => {
      const cur = Number(f[name]);
      const base = Number.isFinite(cur) ? cur : min;
      const next = Math.min(max, Math.max(min, Math.round((base + delta) / step) * step));
      return { ...f, [name]: String(Number(next.toFixed(2))) };
    });
  };

  const parseDishes = () =>
    form.customDishes
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

  // Step 1 → 2 validates only the plan (service is always set, date /
  // hours / guests drive availability). Venue + menu are validated at
  // booking time on step 3, so nobody types an address for a dead date.
  const validatePlan = (durationOverride) => {
    if (!form.date) return "Please choose a date for your session";
    if (form.date < localTodayStr()) return "That date already passed — please pick today or a future date";
    const guests = Number(form.guests);
    if (!form.guests || !Number.isInteger(guests) || guests < 1 || guests > 500)
      return "Number of people must be between 1 and 500";
    const dh = durationOverride ?? form.durationHours;
    const hours = Number(dh);
    if (!dh || !Number.isInteger(hours) || hours < 1 || hours > 4)
      return "Please choose 1, 2, 3 or 4 hours";
    return "";
  };

  const validateVenue = () => {
    if (!form.flatNo.trim()) return "Please enter your flat / house number";
    if (!form.society.trim()) return "Please enter your society / building / street";
    if (!form.city.trim()) return "Please enter your city / area";
    if (parseDishes().length === 0)
      return "Please mention the dishes you need (comma separated)";
    return "";
  };

  const buildAddress = () =>
    `${form.flatNo.trim()}, ${form.society.trim()}${
      form.landmark.trim() ? `, Near ${form.landmark.trim()}` : ""
    }, ${form.city.trim()}`;

  const buildSelectedItems = () => parseDishes();

  // Distinct start–end times across cooks with a free-cook count each,
  // sorted earliest first. Backend already sizes slots to the selected
  // service hours; this only aggregates them for step 2.
  const aggregateSlots = (cooksWithSlots) => {
    const map = new Map();
    cooksWithSlots.forEach((c) => {
      (c.slots || []).forEach((s) => {
        const key = `${s.startTime}-${s.endTime}`;
        if (!map.has(key)) {
          map.set(key, { startTime: s.startTime, endTime: s.endTime, freeCooks: 0 });
        }
        map.get(key).freeCooks += 1;
      });
    });
    return [...map.values()].sort(
      (a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)
    );
  };

  // Shared slot search: load every cook's duration-sized slots for the
  // date, then keep only 08:00–20:00 slots that haven't started yet (for
  // today). Used by the step 1 submit and by post-login draft resume.
  const runSlotSearch = async ({ serviceType, date, durationHours }) => {
    const cooksRes = await API.get(
      `/cooks${serviceType ? `?serviceType=${serviceType}` : ""}`
    );
    const cooks = cooksRes.data || [];
    const suggested = new Set();
    const withSlots = await Promise.all(
      cooks.map(async (cook) => {
        try {
          // Start-time options sized to the entered service hours.
          // suggest=1 asks the server to also name shorter sessions that
          // DO fit, so an empty result becomes a one-tap retry.
          const slotsRes = await API.get(
            `/availability/${cook.user._id}?date=${date}&durationHours=${durationHours}&suggest=1`
          );
          const payload = slotsRes.data;
          const list = Array.isArray(payload) ? payload : payload?.slots || [];
          if (!Array.isArray(payload) && Array.isArray(payload?.suggestions)) {
            payload.suggestions.forEach((s) => {
              if (Number.isFinite(Number(s))) suggested.add(Number(s));
            });
          }
          return { ...cook, slots: list };
        } catch {
          return { ...cook, slots: [] };
        }
      })
    );
    // Service-day + past-time guard (backend enforces the same, this keeps
    // the UI honest even with a stale cache or clock skew).
    const usable = withSlots.map((c) => ({
      ...c,
      slots: (c.slots || []).filter(
        (s) => isSlotInServiceDay(s) && !isSlotInPast(date, s.startTime)
      ),
    }));
    const available = usable.filter((c) => c.slots.length > 0);
    return {
      available,
      options: aggregateSlots(available),
      suggestions: [...suggested].sort((a, b) => b - a).slice(0, 3),
    };
  };

  // Step 1 → 2: validate the plan, then search. `durationOverride` lets a
  // suggestion chip retry with shorter hours without waiting for state.
  const handleSeeSlots = async (e, durationOverride) => {
    e?.preventDefault?.();
    const err = validatePlan(durationOverride);
    if (err) return setFormError(err);
    const effDuration = durationOverride ?? form.durationHours;
    setFormError("");
    setSearching(true);
    setSearched(false);
    setSlotSuggestions([]);
    try {
      const { available, options, suggestions } = await runSlotSearch({
        serviceType: form.serviceType,
        date: form.date,
        durationHours: effDuration,
      });
      setMatches(available);
      setSlotOptions(options);
      setSlotSuggestions(suggestions);
      setSelectedSlot(null);
      setSearched(true);
      setStep(2);
      if (available.length === 0) {
        showToast(
          suggestions.length > 0
            ? `No ${effDuration}-hour slots that day — shorter sessions are free below`
            : "No free slots on this date — try another date or duration",
          "info"
        );
      }
    } catch (err) {
      setFormError(err.response?.data?.message || "Could not load time slots. Try again.");
    } finally {
      setSearching(false);
    }
  };

  // One-tap retry from a suggestion chip: adopt the shorter hours, then
  // re-run the search immediately with the adopted value.
  const retryWithDuration = (h) => {
    const v = String(h);
    setForm((f) => ({ ...f, durationHours: v }));
    handleSeeSlots(null, v);
  };

  // Step 2 → 3: a time slot must be picked before cooks are shown.
  const handleChooseCook = () => {
    if (!selectedSlot) {
      setFormError("Please pick a time slot first");
      return;
    }
    setFormError("");
    setStep(3);
  };

  // Cooks free at the step-2 slot, each carrying its matching slot object
  // for one-tap booking.
  const cooksForSlot = selectedSlot
    ? matches
        .map((c) => ({
          ...c,
          slot: (c.slots || []).find(
            (s) =>
              s.startTime === selectedSlot.startTime &&
              s.endTime === selectedSlot.endTime
          ),
        }))
        .filter((c) => c.slot)
    : [];

  const handleBook = async (cook, slot) => {
    if (!user) {
      // Remember the unfinished booking across the login wall — form,
      // picked slot and pin all come back after sign-in.
      saveBookingDraft({ kind: "on-demand", form, selectedSlot, coords });
      setShowLoginModal(true);
      return;
    }
    if (user.role !== "customer") {
      showToast("Only customer accounts can make bookings", "error");
      return;
    }
    const venueErr = validateVenue();
    if (venueErr) {
      setFormError(venueErr);
      scrollToVenueError();
      return;
    }
    setFormError("");
    setBookingLoading(slot._id);
    try {
      // No online payment — create the booking request directly, then take
      // the customer back to the available-cooks listing. Priced from the
      // launch slab (server recomputes + enforces it).
      const hours = Number(form.durationHours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 4 || slab == null) {
        setFormError("Please choose 1, 2, 3 or 4 hours");
        scrollToVenueError();
        return;
      }
      const payload = {
        cook: cook.user._id,
        serviceType: form.serviceType,
        date: form.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        address: buildAddress(),
        addressDetails: {
          flatNo: form.flatNo.trim(),
          society: form.society.trim(),
          landmark: form.landmark.trim(),
          city: form.city.trim(),
        },
        guests: Number(form.guests),
        durationHours: hours,
        notes: form.notes.trim(),
        selectedItems: buildSelectedItems(),
        couponCode: coupon?.code || "",
        amount: finalPayable,
      };
      if (coords) payload.location = coords;
      const res = await API.post("/bookings", payload);
      clearBookingDraft();
      showToast("Booking request sent! Your slot is held for 5 minutes while the cook decides.", "success");
      // Live waiting screen while the cook decides (5-minute window).
      navigate(`/bookings/${res.data?._id}/wait`);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || "Booking failed", "error");
    } finally {
      setBookingLoading(null);
    }
  };

  const steps = ["Plan", "Time Slot", "Venue & Cook"];

  return (
    <div className={`ondemand-page od-step-${step}`}>
      <div className="ondemand-hero">
        <span className="section-eyebrow">Instant Booking</span>
        <h1 className="section-title">Book a Cook</h1>
        <p className="section-description" style={{ marginBottom: 0 }}>
          Plan it, pick a time, add your venue, choose your cook — address comes last, only when cooks are free.
        </p>
      </div>

      <div className="ondemand-steps">
        {steps.map((label, i) => {
          const n = i + 1;
          const state = step > n ? "done" : step === n ? "active" : "";
          return (
            <div key={label} className={`ondemand-step ${state}`}>
              <span className="ondemand-step-dot">
                {step > n ? <Check size={17} /> : n}
              </span>
              <span>{n}. {label}</span>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <form onSubmit={handleSeeSlots} className="ondemand-form-card">
          <h3>Step 1 — Plan your session</h3>
          <p className="ondemand-form-sub">Service, date, hours and guests first — no address needed until cooks are free.</p>
          <div className="service-pick-grid">
            {SERVICE_OPTIONS.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`service-pick-card ${form.serviceType === s.id ? "selected" : ""}`}
                onClick={() => setForm({ ...form, serviceType: s.id })}
              >
                {form.serviceType === s.id && (
                  <span className="service-pick-check">
                    <CheckCircle2 size={20} />
                  </span>
                )}
                <span className="service-pick-icon">{s.icon}</span>
                <strong>{s.label}</strong>
                <span>{s.desc}</span>
              </button>
            ))}
          </div>

          <SecTitle n="02" icon={<CalendarCheck size={15} />}>When and for how many?</SecTitle>

          <div className="form-row">
            <div className="form-group">
              <label>
                <CalendarCheck size={15} /> Preferred Date
              </label>
              <div className="od-presets" role="group" aria-label="Quick dates">
                <button
                  type="button"
                  className={`bk-dur-chip ${form.date === localTodayStr() ? "active" : ""}`}
                  onClick={() => setForm({ ...form, date: localTodayStr() })}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`bk-dur-chip ${form.date === localTomorrowStr() ? "active" : ""}`}
                  onClick={() => setForm({ ...form, date: localTomorrowStr() })}
                >
                  Tomorrow
                </button>
              </div>
              <input
                type="date"
                name="date"
                className="form-control"
                value={form.date}
                min={localTodayStr()}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>
                <Clock3 size={15} /> Needed for how many hours? *
              </label>
              <div
                className="bk-duration-row"
                role="group"
                aria-label="Quick hour presets"
                style={{ marginBottom: "0.55rem" }}
              >
                {DURATION_QUICK.map((h) => {
                  const active = Number(form.durationHours) === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={active}
                      className={`bk-dur-chip ${active ? "active" : ""}`}
                      onClick={() => setForm({ ...form, durationHours: String(h) })}
                    >
                      {h} hr{h > 1 ? "s" : ""}
                    </button>
                  );
                })}
              </div>
              <div className="od-stepper">
                <button
                  type="button"
                  className="od-step-btn"
                  aria-label="Decrease hours"
                  onClick={() => adjustNumber("durationHours", -1, { min: 1, max: 4, step: 1 })}
                >
                  <Minus size={16} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="durationHours"
                  className="form-control"
                  value={form.durationHours}
                  onChange={handleChange}
                  min={1}
                  max={4}
                  step={1}
                  required
                  aria-label="Hours needed"
                />
                <button
                  type="button"
                  className="od-step-btn"
                  aria-label="Increase hours"
                  onClick={() => adjustNumber("durationHours", 1, { min: 1, max: 4, step: 1 })}
                >
                  <Plus size={16} />
                </button>
              </div>
              <span className="field-hint">Launch pricing: 1 hr ₹199 · 2 hrs ₹349 · 3 hrs ₹499 · 4 hrs ₹649.</span>
            </div>
            <div className="form-group">
              <label>
                <Users size={15} /> Cook for how many people? *
              </label>
              <div className="od-stepper">
                <button
                  type="button"
                  className="od-step-btn"
                  aria-label="Fewer people"
                  onClick={() => adjustNumber("guests", -1, { min: 1, max: 500, step: 1 })}
                >
                  <Minus size={16} />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="guests"
                  className="form-control"
                  value={form.guests}
                  onChange={handleChange}
                  min={1}
                  max={500}
                  required
                  aria-label="Number of people"
                />
                <button
                  type="button"
                  className="od-step-btn"
                  aria-label="More people"
                  onClick={() => adjustNumber("guests", 1, { min: 1, max: 500, step: 1 })}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>

          {formError && <div className="error-message">{formError}</div>}

          <div className="od-stickybar">
            <div className="od-summary" aria-live="polite">
              <span>{serviceLabel}</span>
              <span>{dateLabel(form.date)}</span>
              <span>{form.durationHours || "–"} hr · {form.guests || "–"} guests</span>
              <span>{slab != null ? formatCurrency(slab) : "—"}</span>
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={searching}>
              {searching ? "Loading time slots..." : (
                <>
                  <Clock3 size={17} /> See Time Slots <ArrowRight size={17} />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="ondemand-form-card">
          <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>
            ← Plan
          </button>
          <h3 style={{ marginTop: "0.9rem" }}>Step 2 — Pick a time slot</h3>
          <p className="ondemand-form-sub">
            {form.date} • {form.durationHours} hr{Number(form.durationHours) === 1 ? "" : "s"} •
            Slots run 8:00 AM – 8:00 PM{form.date === localTodayStr() ? " • past times hidden" : ""}.
            Slots are sized to your selected hours.
          </p>
          <SummaryBar form={form} serviceLabel={serviceLabel} onEdit={() => setStep(1)} />
          {searched && slotOptions.length === 0 && (
            <div className="no-data">
              <p>
                {slotSuggestions.length > 0
                  ? `No ${form.durationHours}-hour slots on this date — but shorter sessions are free.`
                  : "No free slots on this date — try another date or duration."}
              </p>
              {slotSuggestions.length > 0 && (
                <div className="od-suggest-row" role="group" aria-label="Durations with free slots">
                  {slotSuggestions.map((h) => (
                    <button
                      key={h}
                      type="button"
                      className="bk-dur-chip"
                      onClick={() => retryWithDuration(h)}
                    >
                      Try {h} hr{h === 1 ? "" : "s"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {slotOptions.length > 0 && (
            <div className="slot-list slot-list-pick" role="radiogroup" aria-label="Available time slots">
              {slotOptions.map((o) => {
                const active =
                  selectedSlot &&
                  selectedSlot.startTime === o.startTime &&
                  selectedSlot.endTime === o.endTime;
                return (
                  <button
                    key={`${o.startTime}-${o.endTime}`}
                    type="button"
                    role="radio"
                    aria-checked={!!active}
                    className={`slot-chip slot-chip-pick ${active ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedSlot({ startTime: o.startTime, endTime: o.endTime });
                      setFormError("");
                    }}
                  >
                    <Clock3 size={15} />
                    {fmtTime(o.startTime)} – {fmtTime(o.endTime)}
                    <span className="slot-chip-count">
                      {o.freeCooks} cook{o.freeCooks > 1 ? "s" : ""} free
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {formError && <div className="error-message">{formError}</div>}

          <button
            type="button"
            className="btn btn-primary btn-block btn-lg"
            disabled={!selectedSlot}
            onClick={handleChooseCook}
            style={{ marginTop: "0.5rem" }}
          >
            Choose Cook <ArrowRight size={17} />
          </button>
          {!selectedSlot && (
            <p className="field-hint" style={{ textAlign: "center", marginTop: "0.5rem" }}>
              Tap a time slot above to continue — the button unlocks once you pick one.
            </p>
          )}
        </div>
      )}

      {step === 3 && selectedSlot && (
        <div>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(2)}>
              ← Change slot
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>
              ← Plan
            </button>
          </div>
          <SummaryBar form={form} serviceLabel={serviceLabel} onEdit={() => setStep(1)} />
          <div className="ondemand-form-card od-venue-card">
            <SecTitle n="03" icon={<MapPin size={15} />}>Where should the cook come?</SecTitle>
            <div className="ondemand-locate-box">
              {savedLocations.length > 0 && (
                <div className="form-group">
                  <label>
                    <History size={15} /> Use previous location
                  </label>
                  <select
                    className="form-control"
                    value={savedIdx}
                    onChange={(e) => applySavedLocation(e.target.value)}
                  >
                    <option value="">Select from your past bookings...</option>
                    {savedLocations.map((s, i) => (
                      <option key={i} value={i}>
                        {s.address}{s.timesUsed > 1 ? ` (used ${s.timesUsed}x)` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {locMsg && (
                <p className="loc-msg warn">
                  {locMsg}
                </p>
              )}
              {coords && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="maps-link-input">
                    <MapPin size={15} /> Google Maps link of your location
                  </label>
                  <div className="maps-link-group">
                    <input
                      id="maps-link-input"
                      type="text"
                      className="form-control"
                      value={mapsLink}
                      readOnly
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={handleCopyLink}
                    >
                      {copied ? (
                        <>
                          <Check size={15} /> Copied
                        </>
                      ) : (
                        "Copy"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>
                  <HomeIcon size={15} /> Flat / House No. *
                </label>
                <input
                  type="text"
                  name="flatNo"
                  className="form-control"
                  value={form.flatNo}
                  onChange={handleChange}
                  placeholder="e.g. Flat 402, Wing B"
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  <Building2 size={15} /> Society / Building / Street *
                </label>
                <input
                  type="text"
                  name="society"
                  className="form-control"
                  value={form.society}
                  onChange={handleChange}
                  placeholder="e.g. Sunshine Society, MG Road"
                  required
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>
                  <Landmark size={15} /> Landmark <small>(optional)</small>
                </label>
                <input
                  type="text"
                  name="landmark"
                  className="form-control"
                  value={form.landmark}
                  onChange={handleChange}
                  placeholder="e.g. Near City Mall"
                />
              </div>
              <div className="form-group">
                <label>
                  <MapPin size={15} /> City / Area *
                </label>
                <input
                  type="text"
                  name="city"
                  className="form-control"
                  value={form.city}
                  onChange={handleChange}
                  placeholder="e.g. Pune"
                  required
                />
              </div>
            </div>

            <SecTitle n="04" icon={<UtensilsCrossed size={15} />}>What dishes do you need? *</SecTitle>
            <div className="form-group">
              <label>Dishes <small>(comma separated)</small></label>
              <input
                type="text"
                name="customDishes"
                className="form-control"
                value={form.customDishes}
                onChange={handleChange}
                placeholder="e.g. Puran Poli, Shankarpali, Modak"
                required
              />
            </div>

            <div className="form-group">
              <label>
                <StickyNote size={15} /> Notes <small>(optional)</small>
              </label>
              <textarea
                name="notes"
                className="form-control"
                value={form.notes}
                onChange={handleChange}
                placeholder="Spice level, dietary needs..."
                rows={3}
              />
            </div>

            <SecTitle n="05" icon={<Clock3 size={15} />}>Price &amp; coupon</SecTitle>
            <div className="price-rows">
              <div className="price-row">
                <span>Service Price · {form.durationHours} hr{Number(form.durationHours) === 1 ? "" : "s"}</span>
                <span>{slab != null ? formatCurrency(slab) : "—"}</span>
              </div>
              {coupon && (
                <div className="price-row discount">
                  <span>Coupon {coupon.code}</span>
                  <span>−{formatCurrency(couponDiscount)}</span>
                </div>
              )}
              <div className="price-row total">
                <span>Final Amount</span>
                <strong>{slab != null ? formatCurrency(finalPayable) : "—"}</strong>
              </div>
            </div>
            {slab != null && (
              <CouponApply
                amount={slab}
                serviceType={form.serviceType}
                onApplied={setCoupon}
              />
            )}

            {user?.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--slate-600)", background: "var(--slate-50)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.9rem" }}>
                <MessageCircle size={15} style={{ color: "var(--accent-emerald)", flexShrink: 0 }} />
                <span>Booking on mobile <strong>+91 {user.phone}</strong> — shared with the cook for coordination.</span>
              </div>
            )}

            {formError && <div ref={venueErrorRef} className="error-message">{formError}</div>}
          </div>
          <div className="match-results-head">
            <h3 className="match-count-title">
              {cooksForSlot.length > 0
                ? `${cooksForSlot.length} cook${cooksForSlot.length > 1 ? "s" : ""} free ${fmtTime(selectedSlot.startTime)} – ${fmtTime(selectedSlot.endTime)} on ${form.date}`
                : `No cooks free ${fmtTime(selectedSlot.startTime)} – ${fmtTime(selectedSlot.endTime)} on ${form.date}`}
            </h3>
          </div>
          {cooksForSlot.length === 0 && (
            <div className="no-data">
              <p>That slot just filled up — pick another time.</p>
              <button className="btn btn-outline btn-sm" onClick={() => setStep(2)}>
                ← Back to slots
              </button>
            </div>
          )}
          <div className="bookings-list">
            {cooksForSlot.map((cook) => {
              const fee = finalPayable;
              return (
                <div key={cook._id} className="match-card">
                  <div className="match-card-top">
                    <div className="match-avatar">
                      {cook.photoUrl ? (
                        <img
                          src={resolveFileUrl(cook.photoUrl)}
                          alt={cook.user?.name || "Cook"}
                          loading="lazy"
                        />
                      ) : (
                        cook.user?.name?.[0]?.toUpperCase() || "C"
                      )}
                    </div>
                    <div className="match-id">
                      <h3>{cook.user?.name}</h3>
                      <p className="match-meta">
                        {cook.serviceArea} • {cook.experienceYears} yrs exp • ★{" "}
                        {cook.rating?.average?.toFixed(1) || "New"} ({cook.rating?.count || 0} reviews)
                      </p>
                    </div>
                    <span className="match-rate" title={`Launch price · ${form.durationHours} hr`}>
                      {slab != null ? formatCurrency(slab) : `₹${cook.rate}/hr`}
                    </span>
                  </div>
                  <div className="tags">
                    {cook.specialties?.slice(0, 4).map((s, i) => (
                      <span key={i} className="tag">{s}</span>
                    ))}
                  </div>
                  <div className="od-bookbox">
                    <div className="od-bookslot">
                      <span className="od-bookslot-time">
                        <Clock3 size={15} /> {fmtTime(cook.slot.startTime)} – {fmtTime(cook.slot.endTime)}
                      </span>
                      <span className="od-bookfee">{formatCurrency(fee)} total</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-block btn-lg od-bookbtn"
                      disabled={bookingLoading === cook.slot._id}
                      onClick={() => handleBook(cook, cook.slot)}
                      title={`Book ${cook.user?.name || "this cook"} for ${formatCurrency(fee)}`}
                    >
                      {bookingLoading === cook.slot._id
                        ? <span className="bk-submit-loading">Booking…</span>
                        : <>Book {(cook.user?.name || "Cook").split(" ")[0]} <ArrowRight size={17} /></>}
                    </button>
                    <p className="slot-pay-note">
                      No advance payment — tap to send your booking request to the cook.
                    </p>
                  </div>
                  {!user && (
                    <p className="field-hint">
                      <LogIn size={13} /> Login as a customer to book this slot
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <LoginPromptModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        returnTo={`/cook-on-demand${initialService !== "cook_with_me" ? `?serviceType=${initialService}` : ""}`}
      />
    </div>
  );
};

export default CookOnDemand;
