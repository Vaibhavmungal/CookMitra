import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, localTodayStr } from "../utils/constants";
import { getCurrentPositionRobust, formatAccuracy, accuracyGrade, reverseGeocode } from "../utils/geolocation";
import {
  Calendar, Clock, AlertCircle, LocateFixed, Navigation,
  History, Copy, Check, ChefHat, Users, BookOpen, Scissors,
  MapPin, StickyNote, Send, ArrowRight
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

const DURATION_OPTIONS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];

/* ── Component ───────────────────────────────────────────────────────── */
const BookingForm = ({ cookId, cookUserId, cookName, hourlyRate = 500, onSubmit }) => {
  const { showToast } = useToast();
  const { user, updateUser } = useAuth();
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

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [resolvedCookUserId, setResolvedCookUserId] = useState(cookUserId || null);
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedIdx, setSavedIdx] = useState("");
  const autoFilled = useRef(false);
  const errorRef = useRef(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

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

  const hoursValid =
    formData.durationHours !== "" &&
    Number.isFinite(Number(formData.durationHours)) &&
    Number(formData.durationHours) >= 0.5 &&
    Number(formData.durationHours) <= 12;



  /* ── Derived time values ── */


  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  

  /* ── Location ── */
  const handleDetectLocation = async () => {
    setLocating(true);
    setLocMsg("Detecting…");
    try {
      const c = await getCurrentPositionRobust();
      setCoords(c);
      const geo = await reverseGeocode(c.lat, c.lng);
      const filled = [];
      if (geo.city || geo.street || geo.suburb) {
        setFormData((prev) => ({
          ...prev,
          city: prev.city.trim() ? prev.city : geo.city || prev.city,
          society: prev.society.trim() ? prev.society : geo.street || prev.society,
          landmark: prev.landmark.trim() ? prev.landmark : geo.suburb || prev.landmark,
        }));
        if (geo.city) filled.push("city");
        if (geo.street) filled.push("street");
        if (geo.suburb) filled.push("area");
      }
      const autoNote = filled.length > 0 ? `Address guessed (${filled.join(", ")}) — verify below.` : "Pin saved — type address.";
      const grade = accuracyGrade(c.accuracy);
      const fixNote = grade === "poor" ? "Poor GPS." : grade === "fair" ? "Approximate." : "Good fix.";
      setLocMsg(`${fixNote} ${autoNote}`);
    } catch (err) {
      setLocMsg(err.message || "Could not detect — type your address.");
    } finally {
      setLocating(false);
    }
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

  const calculateEstimate = () => {
    const entered = Number(formData.durationHours);
    if (formData.durationHours !== "" && Number.isFinite(entered) && entered > 0) {
      const hours = Math.min(12, entered);
      return { hours, total: hours * hourlyRate };
    }
    // Fallback: compute based on startTime and duration if possible
    const toMin = (t) => {
      const [h, m] = String(t).split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const hours = Math.max(0.5, (toMin(derivedEndTime) - toMin(formData.startTime)) / 60);
    return { hours, total: hours * hourlyRate };
  };
  const estimate = calculateEstimate();

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
  const startInPast = formData.startTime && hmToMinutes(formData.startTime) < hmToMinutes(nowHM);

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
      .then((res) => { if (!cancelled) updateUser({ name: res.data?.name, phone: res.data?.phone, address: res.data?.address }); })
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
      // Drop any stale GPS pin from an earlier detect — it would point at the
      // wrong place for this address.
      setCoords(null);
      setLocMsg("Previous location applied — pin for navigation.");
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

  // Auto-detect location when reaching the address step if no address was auto-filled
  useEffect(() => {
    if (step === 2 && !autoFilled.current && savedLoaded && user?.role === "customer") {
      autoFilled.current = true;
      handleDetectLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, savedLoaded, user?.role]);

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) { setShowLoginModal(true); return; }
    if (user.role !== "customer") {
      setError("Only customers can book"); scrollToError(); return;
    }
    const fail = (msg) => { setError(msg); scrollToError(); };
    const serviceHours = Number(formData.durationHours);
    if (!formData.durationHours || isNaN(serviceHours) || serviceHours < 0.5 || serviceHours > 12) {
      fail("Enter hours between 0.5 – 12"); return;
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
        amount: estimate ? Math.max(1, Math.round(estimate.total)) : 0,
      };
      if (coords) payload.location = coords;
      const res = await API.post("/bookings", payload);
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
  const STEP_TITLES = ["Service", "Details", "Confirm"];

  /* ════════════════════════════════════════════════════════════════════ */
  return (
  <div className="bk">

    {/* Error alert */}
    {error && (
      <div ref={errorRef} className="bk-error" role="alert">
        <AlertCircle size={15} /> {error}
      </div>
    )}

    <form onSubmit={handleSubmit} aria-busy={submitting}>
      {/* ── Step 0: Service Type ── */}
      {step === 0 && (
        <div className="bk-card">
          <div className="bk-card-label">
            <ChefHat size={15} /> Service
          </div>
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
                  <Icon size={20} />
                  <span className="bk-service-label">{opt.label}</span>
                  <span className="bk-service-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: Duration & Start Hour ── */}
      {step === 1 && (
        <>
          {/* Duration chips */}
          <div className="bk-card">
            <div className="bk-card-label">
              <Clock size={15} /> Duration
            </div>
            <div className="bk-duration-row">
              {DURATION_OPTIONS.map((h) => {
                const active = Number(formData.durationHours) === h;
                return (
                  <button
                    key={h}
                    type="button"
                    className={`bk-dur-chip ${active ? "active" : ""}`}
                    onClick={() => setFormData((p) => ({ ...p, durationHours: String(h) }))}
                  >
                    {h} hr{h !== 1 ? "s" : ""}
                  </button>
                );
              })}
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.]?[0-9]*"
                name="durationHours"
                className="bk-dur-custom"
                placeholder="Other"
                min={0.5}
                max={12}
                step={0.5}
                value={
                  DURATION_OPTIONS.includes(Number(formData.durationHours))
                    ? ""
                    : formData.durationHours
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "" || (!isNaN(Number(v)) && Number(v) >= 0.5 && Number(v) <= 12)) {
                    setFormData((p) => ({ ...p, durationHours: v }));
                  }
                }}
                aria-label="Custom duration in hours"
              />
              {derivedEndTime && (
                <div className="bk-dur-end">
                  Ends <strong>{fmtHour12(derivedEndTime)}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Start hour selector */}
          <div className="bk-card">
            <div className="bk-card-label">
              <Clock size={15} /> Start Hour
            </div>
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
          {/* Address */}
          <div className="bk-card">
            <div className="bk-card-label">
              <MapPin size={15} /> Address
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
            {/* GPS pin */}
            <div className="bk-pin-bar">
              <button
                type="button"
                className="bk-pin-btn"
                onClick={handleDetectLocation}
                disabled={locating}
              >
                <LocateFixed size={14} />
                {locating ? "Detecting…" : coords ? "Re-pin" : "Pin my location"}
              </button>
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
              <StickyNote size={15} /> Notes
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

          {/* Sticky footer with estimate and submit */}
          <div className="bk-foot">
            {estimate && (
              <div className="bk-foot-estimate">
                <span>{estimate.hours} hr × {formatCurrency(hourlyRate)}</span>
                <span className="bk-foot-total">{formatCurrency(Math.max(1, Math.round(estimate.total)))}</span>
              </div>
            )}
            <button type="submit" className="bk-submit" disabled={submitting}>
              {submitting ? (
                <span className="bk-submit-loading">Sending…</span>
              ) : (
                <>
                  Send Request
                  <ArrowRight size={18} />
                </>
              )}
            </button>
            <p className="bk-foot-note">No payment now — slot held for 5 min while the cook decides.</p>
          </div>
        </>
      )}

      {/* Navigation Buttons */}
      <div className="bk-nav-buttons" style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        {step > 0 && (
          <button type="button" className="bk-back-btn" onClick={() => setStep(step - 1)} disabled={submitting}>
            Back
          </button>
        )}
        {step < 2 && (
          <button
            type="button"
            className="bk-next-btn"
                        onClick={() => {
              // simple validation before advancing
              if (step === 0 && !formData.serviceType) { setError("Select a service type"); scrollToError(); return; }
              if (step === 1) {
                if (!hoursValid) { setError("Enter a valid duration"); scrollToError(); return; }
                if (!formData.startTime) { setError("Select a start time"); scrollToError(); return; }
              }
              setError(""); // clear any previous errors
              setStep(step + 1);
            }}
            disabled={submitting}
          >
            Next
          </button>
        )}
      </div>
    </form>

    <LoginPromptModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
  </div>
);
};

export default BookingForm;
