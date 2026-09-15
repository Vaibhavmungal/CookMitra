import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useDispatch, useSelector } from "react-redux";
import { updateUser } from "../store/authSlice";
import { useShowToast, useSiteLocation } from "../store/hooks";
import { formatCurrency, localTodayStr, slabPriceForDuration, LAUNCH_SLAB_PRICES } from "../utils/constants";
import { saveBookingDraft, loadBookingDraft, clearBookingDraft } from "../utils/bookingDraft";
import CouponApply from "./CouponApply";
import {
  Calendar, CalendarDays, Clock, AlertCircle, Navigation,
  History, Copy, Check, ChefHat, Users, BookOpen, Scissors,
  MapPin, StickyNote, ArrowRight, ChevronLeft,
  BadgePercent, ShieldCheck, Sparkles
} from "lucide-react";
import LoginPromptModal from "./LoginPromptModal";

/* ── Time helpers ────────────────────────────────────────────────────── */
const SERVICE_START_MIN = 8 * 60;
const SERVICE_END_MIN = 20 * 60;
const STEP_MINUTES = 30;

const minutesToHM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const hmToMinutes = (t) => {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

const fmtHour12 = (t) => {
  const m = hmToMinutes(t);
  if (m == null) return t;
  let h = Math.floor(m / 60);
  const mm = m % 60;
  const ap = h >= 12 ? "pm" : "am";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")} ${ap}`;
};

const fmtDateShort = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

const fmtDateDay = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { weekday: "short" });
};

const fmtDateNum = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.getDate();
};

const fmtDateMonth = (d) => {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { month: "short" });
};

const isToday = (d) => d === localTodayStr();

const defaultStartTime = () => {
  const n = new Date();
  const rounded = Math.ceil((n.getHours() * 60 + n.getMinutes()) / STEP_MINUTES) * STEP_MINUTES;
  if (rounded < SERVICE_START_MIN || rounded > SERVICE_END_MIN) return "08:00";
  return minutesToHM(rounded);
};

const nextNDays = (n) => {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${mo}-${da}`);
  }
  return days;
};

/* ── Config ──────────────────────────────────────────────────────────── */
const SERVICE_OPTIONS = [
  { value: "cook_for_me", label: "Cook for me", icon: ChefHat, desc: "Full meal prep" },
  { value: "cook_with_me", label: "Cook with me", icon: Users, desc: "Cook together" },
  { value: "teach_me", label: "Teach me", icon: BookOpen, desc: "Masterclass" },
  { value: "preparation_help", label: "Prep help", icon: Scissors, desc: "Chop & fry" },
];

const DURATION_OPTIONS = [1, 2, 3, 4];
const DURATION_MIN = 1;
const DURATION_MAX = 4;

/* ── Component ───────────────────────────────────────────────────────── */
const BookingForm = ({ cookId, cookUserId, cookName, onSubmit }) => {
  const showToast = useShowToast();
  const user = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [formData, setFormData] = useState(() => ({
    serviceType: "cook_with_me",
    date: localTodayStr(),
    startTime: defaultStartTime(),
    durationHours: "",
    flatNo: "",
    society: "",
    landmark: "",
    city: "",
    notes: "",
  }));
  const [step, setStep] = useState(0);

  // Every step change opens at the top of the page.
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [step]);

  // Start each step at the top of the page.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [step]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);
  const [locMsg, setLocMsg] = useState("");
  const [resolvedCookUserId, setResolvedCookUserId] = useState(cookUserId || null);
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedIdx, setSavedIdx] = useState("");
  const autoFilled = useRef(false);
  const errorRef = useRef(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { location: siteLocation } = useSiteLocation();

  /* ── Resolve cook user id ── */
  useEffect(() => {
    if (cookUserId) { setResolvedCookUserId(cookUserId); return; }
    if (!cookId) return;
    let cancelled = false;
    API.get(`/cooks/${cookId}`)
      .then((res) => {
        if (cancelled) return;
        const profile = res.data || {};
        setResolvedCookUserId((prev) => prev || profile?.user?._id || cookId);
      })
      .catch(() => { if (!cancelled) setResolvedCookUserId(cookId); });
    return () => { cancelled = true; };
  }, [cookId, cookUserId]);

  const minDateStr = localTodayStr();

  const [coupon, setCoupon] = useState(null);

  const hoursValid =
    formData.durationHours !== "" &&
    Number.isInteger(Number(formData.durationHours)) &&
    Number(formData.durationHours) >= DURATION_MIN &&
    Number(formData.durationHours) <= DURATION_MAX;



  /* ── Derived time values ── */


  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  

/* ── Estimate ── */
  const nowHM = (() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  })();

  /* ── Hour selector (instead of time slots) ──
     UI shows hour numbers 08–20; backend uses 30-min grid.
     Selecting "9" sets startTime to "09:00". */
  const hourOptions = [];
  for (let h = 8; h <= 20; h++) {
    hourOptions.push(`${h}:00`);
  }
  /* Keep user's current selection visible even if changed */
  if (formData.startTime && !hourOptions.includes(formData.startTime)) {
    hourOptions.unshift(formData.startTime);
  }

  // Launch slab pricing: one flat price per whole-hour session (the server
  // recomputes it — this is display + coupon preview only).
  const slab = slabPriceForDuration(Number(formData.durationHours));
  const discount = slab != null && coupon ? Math.min(coupon.discount, slab) : 0;
  const finalAmount = slab != null ? Math.max(0, slab - discount) : 0;

  // Derived end time based on start time and duration (service hours limits)
  const derivedEndTime = (() => {
    if (!formData.startTime || !hoursValid) return "";
    const startMin = hmToMinutes(formData.startTime);
    const durMin = Math.round(Number(formData.durationHours) * 60);
    const endMin = startMin + durMin;
    if (endMin > SERVICE_END_MIN) return ""; // exceeds service day
    return minutesToHM(endMin);
  })();

  const endsAfterServiceDay = derivedEndTime && hmToMinutes(derivedEndTime) > SERVICE_END_MIN;
  const startInPast = isToday(formData.date) && formData.startTime && hmToMinutes(formData.startTime) < hmToMinutes(nowHM);

  const serviceLabel =
    (SERVICE_OPTIONS.find((o) => o.value === formData.serviceType) || {}).label || "Service";
  const scheduleSummary = [
    formData.date ? fmtDateShort(formData.date) : null,
    hoursValid ? `${formData.durationHours} hr${Number(formData.durationHours) === 1 ? "" : "s"}` : null,
    formData.startTime ? `${fmtHour12(formData.startTime)}${derivedEndTime ? ` → ${fmtHour12(derivedEndTime)}` : ""}` : null,
  ].filter(Boolean).join(" · ");

  const goNext = () => {
    if (step === 0 && !formData.serviceType) { setError("Select a service type"); scrollToError(); return; }
    if (step === 1) {
      if (!formData.date) { setError("Please choose a date"); scrollToError(); return; }
      if (formData.date < minDateStr) { setError("That date already passed — please pick today or a future date"); scrollToError(); return; }
      if (!hoursValid) { setError("Please choose 1, 2, 3 or 4 hours"); scrollToError(); return; }
      if (!formData.startTime) { setError("Select a start time"); scrollToError(); return; }
      if (!derivedEndTime) { setError("That start + duration ends after 8 PM — pick an earlier start"); scrollToError(); return; }
      if (startInPast) { setError("That time already passed today — pick a later start"); scrollToError(); return; }
    }
    setError("");
    setStep(step + 1);
  };

  /* ── Map pin ── */
  const pinMapsUrl = coords?.lat != null && coords?.lng != null
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}` : null;

  const handleCopyPin = async () => {
    if (!pinMapsUrl) return;
    try { await navigator.clipboard.writeText(pinMapsUrl); } catch {
      const el = document.createElement("textarea");
      el.value = pinMapsUrl; document.body.appendChild(el);
      el.select(); document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopiedPin(true); setTimeout(() => setCopiedPin(false), 2000);
  };

  /* ── Address builder ── */
  const buildAddress = () =>
    `${formData.flatNo.trim()}, ${formData.society.trim()}${
      formData.landmark.trim() ? `, Near ${formData.landmark.trim()}` : ""
    }${formData.city.trim() ? `, ${formData.city.trim()}` : ""}`;

  /* ── Saved locations ── */
  const [savedLoaded, setSavedLoaded] = useState(false);
  useEffect(() => {
    if (user?.role !== "customer") { setSavedLoaded(true); return; }
    let cancelled = false;
    API.get("/bookings/my/locations")
      .then((res) => { if (!cancelled) { setSavedLocations(res.data || []); setSavedLoaded(true); } })
      .catch(() => { if (!cancelled) { setSavedLocations([]); setSavedLoaded(true); } });
    return () => { cancelled = true; };
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "customer" || user?.address !== undefined) return;
    let cancelled = false;
    API.get("/auth/me")
      .then((res) => { if (!cancelled) dispatch(updateUser({ name: res.data?.name, phone: res.data?.phone, address: res.data?.address })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user?.role, user?.address]);

  const applySavedLocation = (idx) => {
    const saved = savedLocations[Number(idx)];
    if (!saved) return;
    const d = saved.addressDetails || {};
    // Explicit pick always replaces the auto-filled address block (GPS guesses
    // or a previously applied entry) — the saved address is authoritative.
    // Entries without structured details (older bookings) fall back to parsing
    // their address string, same heuristic as the profile-address fill below.
    const parts = String(saved.address || "").split(",").map((p) => p.trim()).filter(Boolean);
    const src = Object.keys(d).length > 0
      ? d
      : parts.length === 1
        ? { society: parts[0] }
        : parts.length === 2
          ? { flatNo: parts[0], society: parts[1] }
          : { flatNo: parts[0], society: parts.slice(1, -1).join(", "), city: parts[parts.length - 1] };
    setFormData((prev) => ({
      ...prev,
      flatNo: src.flatNo || "",
      society: src.society || "",
      landmark: src.landmark || "",
      city: src.city || "",
    }));
    setSavedIdx(String(idx));
    if (saved.location?.lat != null) {
      setCoords({ lat: saved.location.lat, lng: saved.location.lng });
      setLocMsg("Previous location applied with saved pin.");
    } else {
      // Drop any stale detected pin — it would point at the wrong place
      // for this address.
      setCoords(null);
      setLocMsg("Previous location applied — verify the address below.");
    }
  };

  useEffect(() => {
    if (autoFilled.current || !savedLoaded || user?.role !== "customer") return;
    if (savedLocations.length > 0) {
      autoFilled.current = true;
      setFormData((prev) => {
        if (prev.flatNo || prev.society || prev.landmark || prev.city) return prev;
        const d = savedLocations[0].addressDetails || {};
        return { ...prev, flatNo: d.flatNo || "", society: d.society || "", landmark: d.landmark || "", city: d.city || "" };
      });
      setSavedIdx("0");
      if (savedLocations[0].location?.lat != null) {
        setCoords({ lat: savedLocations[0].location.lat, lng: savedLocations[0].location.lng });
      }
      return;
    }
    const profileAddress = user?.address?.trim();
    if (profileAddress) {
      autoFilled.current = true;
      const parts = profileAddress.split(",").map((p) => p.trim()).filter(Boolean);
      let flatNo = "", society = "", city = "";
      if (parts.length === 1) society = parts[0];
      else if (parts.length === 2) [flatNo, society] = parts;
      else if (parts.length > 2) { flatNo = parts[0]; city = parts[parts.length - 1]; society = parts.slice(1, -1).join(", "); }
      setFormData((prev) => {
        if (prev.flatNo || prev.society || prev.landmark || prev.city) return prev;
        return { ...prev, flatNo, society, city };
      });
    }
  }, [savedLocations, savedLoaded, user?.role, user?.address]);

  // Auto-fill address fields from the LocationContext-detected location
  // (auto-detected on page visit) when no address has been filled yet.
  // Typed, saved, or profile input always wins. The detected pin is also
  // attached for cook navigation — no manual detect button needed.
  useEffect(() => {
    if (!siteLocation?.city && !siteLocation?.area && !siteLocation?.state) return;
    if (autoFilled.current) return;
    autoFilled.current = true;
    setFormData((prev) => {
      if (prev.flatNo || prev.society || prev.landmark || prev.city) return prev;
      return {
        ...prev,
        city: prev.city.trim() ? prev.city : siteLocation.city || "",
        society: prev.society.trim() ? prev.society : siteLocation.area || siteLocation.street || "",
        landmark: prev.landmark.trim() ? prev.landmark : siteLocation.street || siteLocation.area || "",
      };
    });
    if (Number.isFinite(siteLocation?.lat) && Number.isFinite(siteLocation?.lng)) {
      setCoords((c) => c || { lat: siteLocation.lat, lng: siteLocation.lng });
    }
  }, [siteLocation?.city, siteLocation?.area, siteLocation?.state, siteLocation?.street, siteLocation?.lat, siteLocation?.lng]);

  // Returning from login with an unfinished booking for THIS cook: restore
  // the filled fields + pin and land back on the confirm step. Runs once;
  // another cook's draft or a stale one is left alone.
  const resumedDraft = useRef(false);
  useEffect(() => {
    if (resumedDraft.current || !user) return;
    const d = loadBookingDraft();
    if (!d || d.kind !== "cook-profile" || !d.form) return;
    if (cookId && d.cookId && String(d.cookId) !== String(cookId)) return;
    if (!d.savedAt || Date.now() - d.savedAt > 2 * 3600 * 1000) {
      clearBookingDraft();
      return;
    }
    resumedDraft.current = true;
    autoFilled.current = true;
    setFormData((prev) => ({ ...prev, ...d.form }));
    if (d.coords?.lat != null) setCoords(d.coords);
    setStep(2);
    showToast("Welcome back — your booking details were restored. Just tap Send Request.", "success");
    clearBookingDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cookId]);

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      // Remember the unfinished booking across the login wall.
      saveBookingDraft({ kind: "cook-profile", cookId: cookId ?? resolvedCookUserId, form: formData, coords });
      setShowLoginModal(true);
      return;
    }
    if (user.role !== "customer") {
      setError("Only customers can book"); scrollToError(); return;
    }
    const fail = (msg) => { setError(msg); scrollToError(); };
    if (!formData.date) { fail("Please choose a date"); return; }
    if (formData.date < minDateStr) { fail("That date already passed — please pick today or a future date"); return; }
    const serviceHours = Number(formData.durationHours);
    if (!formData.durationHours || !Number.isInteger(serviceHours) || serviceHours < DURATION_MIN || serviceHours > DURATION_MAX) {
      fail("Please choose 1, 2, 3 or 4 hours"); return;
    }
    if (!resolvedCookUserId) { fail("Cook details loading — retry"); return; }
    if (!formData.startTime || !derivedEndTime) { fail("Pick a start time"); return; }
    if (endsAfterServiceDay) { fail("Must end by 8 PM"); return; }
    if (startInPast) { fail("Time passed — pick later"); return; }

    if (!formData.flatNo.trim()) { fail("Enter flat / house number"); return; }
    if (!formData.society.trim()) { fail("Enter society / street"); return; }

    setSubmitting(true); setError("");
    try {
      const selectedItems = formData.notes.split(/[,;]+/).map((d) => d.trim()).filter(Boolean);
      const payload = {
        cook: resolvedCookUserId,
        serviceType: formData.serviceType,
        date: formData.date,
        startTime: formData.startTime,
        endTime: derivedEndTime,
        address: buildAddress(),
        addressDetails: {
          flatNo: formData.flatNo.trim(),
          society: formData.society.trim(),
          landmark: formData.landmark.trim(),
          city: formData.city.trim(),
        },
        notes: formData.notes,
        selectedItems,
        durationHours: serviceHours,
        couponCode: coupon?.code || "",
        amount: finalAmount,
      };
      if (coords) payload.location = coords;
      const res = await API.post("/bookings", payload);
      clearBookingDraft();
      showToast("Request sent — slot held for 5 min.", "success", 7000);
      onSubmit?.(res.data);
      navigate(`/bookings/${res.data._id}/wait`);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Booking failed.";
      fail(msg); showToast(msg, "error");
      // Removed undefined refreshSlots call
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToError = () => requestAnimationFrame(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));

  /* ── Date carousel ── */
  const dateDays = nextNDays(7);
  const STEP_TITLES = ["Service", "Schedule", "Confirm"];
  const STEP_DESCS = ["What do you need?", "When should we come?", "Where & review"];

  /* ════════════════════════════════════════════════════════════════════ */
  return (
  <div className={`bk bk-modern bk-step-${step}`}>

    {/* Header */}
    <div className="bk-head">
      <div className="bk-head-text">
        <span className="bk-eyebrow">
          <Sparkles size={12} /> Instant booking
        </span>
        <h2 className="bk-title">{cookName ? `Book ${String(cookName).split(" ")[0]}` : "Book your cook"}</h2>
        <p className="bk-sub">
          <ShieldCheck size={13} /> Verified home cook · No payment now — slot held 5 min
        </p>
      </div>
      {slab != null && hoursValid && (
        <div className="bk-head-price" aria-live="polite">
          <span>{formData.durationHours} hr{Number(formData.durationHours) === 1 ? "" : "s"}</span>
          <strong>{formatCurrency(finalAmount)}</strong>
        </div>
      )}
    </div>

    {/* Error alert */}
    {error && (
      <div ref={errorRef} className="bk-error" role="alert">
        <AlertCircle size={14} /> {error}
      </div>
    )}

    {/* Step progress */}
    <ol className="bk-steps-modern" aria-label="Booking progress">
      {STEP_TITLES.map((title, i) => (
        <li
          key={title}
          className={`bk-step-item ${i < step ? "done" : i === step ? "active" : ""}`}
          aria-current={i === step ? "step" : undefined}
        >
          <span className="bk-step-num" aria-hidden="true">
            {i < step ? <Check size={13} /> : i + 1}
          </span>
          <span className="bk-step-text">
            <span className="bk-step-name">{title}</span>
            <span className="bk-step-desc">{STEP_DESCS[i]}</span>
          </span>
          {i < STEP_TITLES.length - 1 && <span className="bk-step-link" aria-hidden="true" />}
        </li>
      ))}
    </ol>

    {/* Live recap once anything is picked */}
    {(step > 0 && (scheduleSummary || serviceLabel)) && (
      <div className="bk-livebar" aria-live="polite">
        <span className="bk-livechip">{serviceLabel}</span>
        {scheduleSummary && <span className="bk-livechip bk-livechip-strong">{scheduleSummary}</span>}
        {slab != null && hoursValid && <span className="bk-livechip bk-livechip-price">{formatCurrency(slab)}</span>}
      </div>
    )}

    <form onSubmit={handleSubmit} aria-busy={submitting}>
      <div className="bk-step" key={step}>
      {/* ── Step 0: Service Type ── */}
      {step === 0 && (
        <div className="bk-card">
          <div className="bk-card-label">
            <ChefHat size={14} /> Which service do you need?
          </div>
          <p className="bk-card-hint">Same launch price for every service — pick what fits today.</p>
          <div className="bk-service-grid">
            {SERVICE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = formData.serviceType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  className={`bk-service-card ${active ? "active" : ""}`}
                  onClick={() => setFormData((p) => ({ ...p, serviceType: opt.value }))}
                  aria-pressed={active}
                >
                  <Icon size={17} />
                  <span className="bk-service-label">{opt.label}</span>
                  <span className="bk-service-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: Date, Duration & Start Hour ── */}
      {step === 1 && (
        <>
          {/* Date carousel */}
          <div className="bk-card">
            <div className="bk-card-label">
              <CalendarDays size={14} /> Which date?
            </div>
            <div className="bk-date-row" role="group" aria-label="Pick a date">
              {dateDays.map((d) => {
                const active = formData.date === d;
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={active}
                    className={`bk-date-cell ${active ? "active" : ""} ${isToday(d) ? "today" : ""}`}
                    onClick={() => setFormData((p) => ({ ...p, date: d }))}
                    title={fmtDateShort(d)}
                  >
                    <span className="bk-date-day">{isToday(d) ? "Today" : fmtDateDay(d)}</span>
                    <span className="bk-date-num">{fmtDateNum(d)}</span>
                    <span className="bk-date-mon">{fmtDateMonth(d)}</span>
                  </button>
                );
              })}
            </div>
            <div className="bk-date-manual">
              <Calendar size={13} />
              <input
                type="date"
                name="date"
                className="bk-date-input"
                value={formData.date}
                min={minDateStr}
                onChange={handleChange}
                aria-label="Or pick another date"
              />
              {formData.date && (
                <span className="bk-date-picked">{fmtDateShort(formData.date)}</span>
              )}
            </div>
          </div>

          {/* Duration — launch pricing cells are the selector */}
          <div className="bk-card">
            <div className="bk-card-label">
              <Clock size={14} /> How long?
            </div>
            <div className="bk-price-strip" aria-label="Launch pricing">
              <span className="bk-price-badge">
                <BadgePercent size={13} /> Launch pricing
              </span>
              <div className="bk-price-cells">
                {DURATION_OPTIONS.map((h) => {
                  const active = Number(formData.durationHours) === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={active}
                      className={`bk-price-cell ${active ? "active" : ""}`}
                      onClick={() => setFormData((p) => ({ ...p, durationHours: String(h) }))}
                      title={`Select ${h} hour${h !== 1 ? "s" : ""}`}
                    >
                      <span>{h} hr{h !== 1 ? "s" : ""}</span>
                      <strong>{formatCurrency(LAUNCH_SLAB_PRICES[h])}</strong>
                    </button>
                  );
                })}
              </div>
              <span className="bk-price-note">Flat rate · same for every cook &amp; service · no payment now</span>
            </div>
            {derivedEndTime && (
              <div className="bk-dur-end">
                Ends <strong>{fmtHour12(derivedEndTime)}</strong>
              </div>
            )}
          </div>

          {/* Start hour selector */}
          <div className="bk-card">
            <div className="bk-card-label">
              <Clock size={14} /> What start time?
            </div>
            <p className="bk-card-hint">Service hours 8:00 am – 8:00 pm · tap a start, we show the end.</p>
            <div className="bk-hour-select">
              {hourOptions.map((t) => {
                const active = formData.startTime === t;
                return (
                  <button
                    key={t}
                    type="button"
                    className={`bk-hour-btn ${active ? "active" : ""}`}
                    onClick={() => setFormData((p) => ({ ...p, startTime: t }))}
                  >
                    {fmtHour12(t)}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Step 2: Address, Notes & Submit ── */}
      {step === 2 && (
        <>
          {/* Recap */}
          <div className="bk-card bk-recap">
            <div className="bk-card-label">
              <Check size={14} /> Your booking
            </div>
            <div className="bk-recap-rows">
              <div className="bk-recap-row">
                <span>{serviceLabel}{formData.date ? ` · ${fmtDateShort(formData.date)}` : ""}</span>
                <button type="button" className="bk-recap-edit" onClick={() => setStep(0)}>Edit</button>
              </div>
              <div className="bk-recap-row">
                <span>
                  {hoursValid ? `${formData.durationHours} hr${Number(formData.durationHours) === 1 ? "" : "s"}` : "Duration"}
                  {slab != null && hoursValid ? ` · ${formatCurrency(slab)}` : ""}
                  {formData.startTime ? ` · ${fmtHour12(formData.startTime)}${derivedEndTime ? ` → ${fmtHour12(derivedEndTime)}` : ""}` : ""}
                </span>
                <button type="button" className="bk-recap-edit" onClick={() => setStep(1)}>Edit</button>
              </div>
            </div>
          </div>

          {/* Address */}
          <div className="bk-card">
            <div className="bk-card-label">
              <MapPin size={14} /> Address
            </div>
            {savedLocations.length > 0 && (
              <div className="bk-saved-wrap">
                <History size={14} />
                <select
                  className="bk-saved-select"
                  value={savedIdx}
                  onChange={(e) => applySavedLocation(e.target.value)}
                >
                  <option value="">Use previous location…</option>
                  {savedLocations.map((s, i) => (
                    <option key={i} value={i}>
                      {s.address}{s.timesUsed > 1 ? ` (×${s.timesUsed})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="bk-addr-grid">
              <input
                type="text"
                name="flatNo"
                className="bk-addr-input"
                placeholder="Flat / House *"
                value={formData.flatNo}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="society"
                className="bk-addr-input"
                placeholder="Society / Street *"
                value={formData.society}
                onChange={handleChange}
                required
              />
              <input
                type="text"
                name="city"
                className="bk-addr-input"
                placeholder="City / Area"
                value={formData.city}
                onChange={handleChange}
              />
              <input
                type="text"
                name="landmark"
                className="bk-addr-input"
                placeholder="Landmark"
                value={formData.landmark}
                onChange={handleChange}
              />
            </div>
            {/* Auto-attached map pin (from detected location or saved entry) */}
            <div className="bk-pin-bar">
              {pinMapsUrl && (
                <>
                  <button type="button" className="bk-pin-icon" onClick={handleCopyPin} title="Copy link">
                    {copiedPin ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                  <a href={pinMapsUrl} target="_blank" rel="noreferrer" className="bk-pin-icon" title="Open Maps">
                    <Navigation size={14} />
                  </a>
                </>
              )}
            </div>
            {locMsg && <p className="bk-pin-msg">{locMsg}</p>}
          </div>

          {/* Notes */}
          <div className="bk-card">
            <div className="bk-card-label">
              <StickyNote size={14} /> Notes
            </div>
            <textarea
              name="notes"
              className="bk-notes"
              rows={3}
              placeholder="Guests, dishes, dietary needs, spice level…"
              value={formData.notes}
              onChange={handleChange}
            />
          </div>

          {/* Sticky footer with price breakdown and submit */}
          <div className="bk-foot">
            {slab != null && (
              <div className="bk-foot-estimate">
                <div className="price-rows" style={{ flex: 1 }}>
                  <div className="price-row">
                    <span>Service Price · {formData.durationHours} hr{Number(formData.durationHours) === 1 ? "" : "s"}</span>
                    <span>{formatCurrency(slab)}</span>
                  </div>
                  {coupon && (
                    <div className="price-row discount">
                      <span>Coupon {coupon.code}</span>
                      <span>−{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div className="price-row total">
                    <span>Final Amount</span>
                    <strong>{formatCurrency(finalAmount)}</strong>
                  </div>
                </div>
              </div>
            )}
            {slab != null && (
              <CouponApply
                amount={slab}
                serviceType={formData.serviceType}
                onApplied={setCoupon}
              />
            )}
            <button type="submit" className="bk-submit" disabled={submitting}>
              {submitting ? (
                <span className="bk-submit-loading">Sending…</span>
              ) : (
                <>
                  Send Request
                  <ArrowRight size={16} />
                </>
              )}
            </button>
            <p className="bk-foot-note">No payment now — slot held for 5 min while the cook decides.</p>
          </div>
        </>
      )}
      </div>

      {/* Sticky footer */}
      <div className="bk-stickybar">
        <div className="bk-sticky-summary" aria-live="polite">
          {slab != null && hoursValid ? (
            <>
              <span>{scheduleSummary || serviceLabel}</span>
              <strong>{formatCurrency(finalAmount)}</strong>
            </>
          ) : (
            <>
              <span>{step === 0 ? serviceLabel : scheduleSummary || "Pick your schedule"}</span>
              <strong>{slab != null ? formatCurrency(slab) : "₹—"}</strong>
            </>
          )}
        </div>
        <div className="bk-sticky-actions">
          {step > 0 && (
            <button type="button" className="bk-back-btn" onClick={() => setStep(step - 1)} disabled={submitting}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          {step < 2 && (
            <button
              type="button"
              className="bk-next-btn"
              onClick={goNext}
              disabled={submitting}
            >
              Continue <ArrowRight size={16} />
            </button>
          )}
          {step === 2 && (
            <span className="bk-sticky-hint">Review &amp; tap “Send Request” above</span>
          )}
        </div>
      </div>
    </form>

    <LoginPromptModal
      open={showLoginModal}
      onClose={() => setShowLoginModal(false)}
      returnTo={cookId ? `/cooks/${cookId}` : null}
    />
  </div>
);
};

export default BookingForm;
