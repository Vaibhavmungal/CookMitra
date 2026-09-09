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
  LocateFixed,
  Clock3,
  Building2,
  Landmark,
  Home as HomeIcon,
  MessageCircle,
  History,
  ArrowRight,
} from "lucide-react";
import API from "../api/axios";
import { formatCurrency, localTodayStr, localTomorrowStr } from "../utils/constants";
import { resolveFileUrl } from "../components/CookDocUploads";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useLocation as useSiteLocation } from "../context/LocationContext";
import { getCurrentPositionRobust, reverseGeocode } from "../utils/geolocation";
import LoginPromptModal from "../components/LoginPromptModal";

const SERVICE_OPTIONS = [
  { id: "cook_for_me", label: "Cook for Me", desc: "Cook prepares food at your home", icon: <ChefHat size={24} /> },
  { id: "cook_with_me", label: "Cook With Me", desc: "Prepare together, learn as you go", icon: <Users size={24} /> },
  { id: "teach_me", label: "Teach Me", desc: "Hands-on lesson in festive cooking", icon: <GraduationCap size={24} /> },
  { id: "preparation_help", label: "Preparation Help", desc: "Help with chopping, dough, frying", icon: <HandHelping size={24} /> },
];

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
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [coords, setCoords] = useState(null);
  const [copied, setCopied] = useState(false);
  const [savedLocations, setSavedLocations] = useState([]);
  const [savedIdx, setSavedIdx] = useState("");
  const autoFilled = useRef(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  // Step 2 (time slots): one entry per distinct start–end time with the
  // number of cooks free at it. Step 3 (cook) shows cooks free at the slot
  // the customer picked in step 2.
  const [slotOptions, setSlotOptions] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);

  // Header-detected place (GPS / IP / manual) pre-fills the city field when
  // it is still empty — typed or previously-saved input always wins.
  useEffect(() => {
    const detected = (siteLocation?.city || "").trim();
    if (!detected) return;
    setForm((f) => (f.city.trim() ? f : { ...f, city: detected }));
    if (Number.isFinite(siteLocation?.lat) && Number.isFinite(siteLocation?.lng)) {
      setCoords((c) => c || { lat: siteLocation.lat, lng: siteLocation.lng });
    }
  }, [siteLocation?.city, siteLocation?.lat, siteLocation?.lng]);

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
      // Drop any stale pin from an earlier detect — it would point at the
      // wrong place for this address.
      setCoords(null);
      setLocMsg("Previous location applied — auto-detect or verify the pin for precise navigation");
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

  const handleDetectLocation = async () => {
    setLocating(true);
    setLocMsg("");
    try {
      const c = await getCurrentPositionRobust();
      // Pin precise coordinates for cook navigation, even if the address
      // lookup fails. Success stays quiet (fields fill in) — only problems
      // are shown. Only empty fields are filled so saved/typed input wins.
      setCoords({ lat: c.lat, lng: c.lng });
      setLocMsg("");
      const geo = await reverseGeocode(c.lat, c.lng);
      if (geo.city || geo.street || geo.suburb) {
        setForm((f) => ({
          ...f,
          city: f.city.trim() ? f.city : geo.city || f.city,
          society: f.society.trim() ? f.society : geo.street || f.society,
          landmark: f.landmark.trim() ? f.landmark : geo.suburb || f.landmark,
        }));
      } else {
        setLocMsg("Could not determine your address — please type it");
      }
    } catch (err) {
      setLocMsg(err.message || "Location permission denied — please type your city");
    } finally {
      setLocating(false);
    }
  };

  const parseDishes = () =>
    form.customDishes
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);

  const validateStep1 = () => {
    if (!form.date) return "Please choose a date for your session";
    if (form.date < localTodayStr()) return "That date already passed — please pick today or a future date";
    if (!form.flatNo.trim()) return "Please enter your flat / house number";
    if (!form.society.trim()) return "Please enter your society / building / street";
    if (!form.city.trim()) return "Please enter or auto-detect your city / area";
    const guests = Number(form.guests);
    if (!form.guests || !Number.isInteger(guests) || guests < 1 || guests > 500)
      return "Number of people must be between 1 and 500";
    const hours = Number(form.durationHours);
    if (!form.durationHours || isNaN(hours) || hours < 1 || hours > 12)
      return "Duration must be between 1 and 12 hours";
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

  // Step 1 → 2: validate the requirement, load every cook's duration-sized
  // slots for the date, then keep only 08:00–20:00 slots that haven't
  // started yet (for today). The customer picks a time first; cooks come
  // in step 3.
  const handleSeeSlots = async (e) => {
    e.preventDefault();
    const err = validateStep1();
    if (err) return setFormError(err);
    setFormError("");
    setSearching(true);
    setSearched(false);
    try {
      const cooksRes = await API.get(
        `/cooks${form.serviceType ? `?serviceType=${form.serviceType}` : ""}`
      );
      const cooks = cooksRes.data || [];
      const withSlots = await Promise.all(
        cooks.map(async (cook) => {
          try {
            // Start-time options sized to the entered service hours.
            const slotsRes = await API.get(
              `/availability/${cook.user._id}?date=${form.date}&durationHours=${form.durationHours}`
            );
            return { ...cook, slots: slotsRes.data || [] };
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
          (s) => isSlotInServiceDay(s) && !isSlotInPast(form.date, s.startTime)
        ),
      }));
      const available = usable.filter((c) => c.slots.length > 0);
      setMatches(available);
      setSlotOptions(aggregateSlots(available));
      setSelectedSlot(null);
      setSearched(true);
      setStep(2);
      if (available.length === 0) {
        showToast("No free slots on this date — try another date or duration", "info");
      }
    } catch (err) {
      setFormError(err.response?.data?.message || "Could not load time slots. Try again.");
    } finally {
      setSearching(false);
    }
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
      setShowLoginModal(true);
      return;
    }
    if (user.role !== "customer") {
      showToast("Only customer accounts can make bookings", "error");
      return;
    }
    setBookingLoading(slot._id);
    try {
      // No online payment — create the booking request directly, then take
      // the customer back to the available-cooks listing.
      const hours = Number(form.durationHours);
      const fee = Math.max(1, Math.round(Number(cook.rate) * hours));
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
        amount: fee,
      };
      if (coords) payload.location = coords;
      const res = await API.post("/bookings", payload);
      showToast("Booking request sent! Your slot is held for 5 minutes while the cook decides.", "success");
      // Live waiting screen while the cook decides (5-minute window).
      navigate(`/bookings/${res.data?._id}/wait`);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || "Booking failed", "error");
    } finally {
      setBookingLoading(null);
    }
  };

  const steps = ["Details", "Time Slot", "Pick Cook"];

  return (
    <div className="ondemand-page">
      <div className="ondemand-hero">
        <span className="section-eyebrow">Instant Booking</span>
        <h1 className="section-title">Book a Cook</h1>
        <p className="section-description" style={{ marginBottom: 0 }}>
          Tell us what you need, pick a time slot, then choose your cook — booked in seconds.
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
          <h3>Step 1 — What do you need?</h3>
          <p className="ondemand-form-sub">Choose a service to see cooks who offer it.</p>
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

          <div className="form-row">
            <div className="form-group">
              <label>
                <CalendarCheck size={15} /> Preferred Date
              </label>
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
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.]?[0-9]*"
                name="durationHours"
                className="form-control"
                value={form.durationHours}
                onChange={handleChange}
                min={1}
                max={12}
                step={0.5}
                required
              />
            </div>
            <div className="form-group">
              <label>
                <Users size={15} /> Cook for how many people? *
              </label>
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
              />
            </div>
          </div>

          <h3 className="ondemand-section-title">
            <MapPin size={18} /> Where should the cook come?
          </h3>
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
            <button
              type="button"
              className="btn btn-outline detect-btn"
              onClick={handleDetectLocation}
              disabled={locating}
            >
              <LocateFixed size={16} />
              {locating ? "Detecting location..." : "Auto-detect my location"}
            </button>
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

          <h3 className="ondemand-section-title">
            <UtensilsCrossed size={15} /> What dishes do you need? *
          </h3>
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

          {formError && <div className="error-message">{formError}</div>}

          {user?.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--slate-600)", background: "var(--slate-50)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.9rem", marginBottom: "0.9rem" }}>
              <MessageCircle size={15} style={{ color: "var(--accent-emerald)", flexShrink: 0 }} />
              <span>Booking on mobile <strong>+91 {user.phone}</strong> — shared with the cook for coordination.</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={searching}>
            {searching ? "Loading time slots..." : (
              <>
                <Clock3 size={17} /> See Time Slots <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="ondemand-form-card">
          <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>
            ← Details
          </button>
          <h3 style={{ marginTop: "0.9rem" }}>Step 2 — Pick a time slot</h3>
          <p className="ondemand-form-sub">
            {form.date} • {form.durationHours} hr{Number(form.durationHours) === 1 ? "" : "s"} •
            Slots run 8:00 AM – 8:00 PM{form.date === localTodayStr() ? " • past times hidden" : ""}.
            Slots are sized to your selected hours.
          </p>
          {searched && slotOptions.length === 0 && (
            <div className="no-data">
              <p>No free slots on this date — try another date or duration.</p>
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
        </div>
      )}

      {step === 3 && selectedSlot && (
        <div>
          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(2)}>
              ← Change slot
            </button>
            <button className="btn btn-outline btn-sm" onClick={() => setStep(1)}>
              ← Change details
            </button>
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
              const fee = Math.round(Number(cook.rate) * Number(form.durationHours));
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
                    <span className="match-rate">₹{cook.rate}/hr</span>
                  </div>
                  <div className="tags">
                    {cook.specialties?.slice(0, 4).map((s, i) => (
                      <span key={i} className="tag">{s}</span>
                    ))}
                  </div>
                  <div className="slot-list">
                    <button
                      className="slot-chip slot-chip-book"
                      disabled={bookingLoading === cook.slot._id}
                      onClick={() => handleBook(cook, cook.slot)}
                      title={`Book for ${formatCurrency(fee)}`}
                    >
                      {bookingLoading === cook.slot._id
                        ? "Booking..."
                        : <><Clock3 size={15} /> {fmtTime(cook.slot.startTime)} – {fmtTime(cook.slot.endTime)} • Book for {formatCurrency(fee)}</>}
                    </button>
                  </div>
                  <p className="slot-pay-note">
                    No advance payment — tap to send your booking request to the cook.
                  </p>
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

      <LoginPromptModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
};

export default CookOnDemand;
