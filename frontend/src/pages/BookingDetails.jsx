import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import ReviewForm from "../components/ReviewForm";
import {
  formatCurrency,
  formatDate,
  mapsNavigateUrl,
  bookingWhatsAppUrl,
  bookingCustomerWhatsAppUrl,
  bookingCookJobWhatsAppUrl,
  bookingRescheduleWhatsAppUrl,
  hoursCompleteWhatsAppUrl,
  cookLiveMapsUrl,
  sessionEndDate,
  hasServiceHoursStarted,
  formatRemaining,
  timeAgo,
  localTodayStr,
  SERVICE_DETAILS,
} from "../utils/constants";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Navigation,
  ChefHat,
  Phone,
  MessageCircle,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BellRing,
  Receipt,
  History,
  User,
} from "lucide-react";

const BookingDetails = () => {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Cook enters the customer's OTP to start the service clock.
  const [otpInput, setOtpInput] = useState("");
  const [startingService, setStartingService] = useState(false);
  const [otpError, setOtpError] = useState("");
  // Reschedule (customer moves an upcoming booking to a new date/time —
  // duration and fee stay fixed).
  const [reschedOpen, setReschedOpen] = useState(false);
  const [rsDate, setRsDate] = useState("");
  const [rsStart, setRsStart] = useState("");
  const [freeStarts, setFreeStarts] = useState([]);
  const [startsLoading, setStartsLoading] = useState(false);
  const [reschedSaving, setReschedSaving] = useState(false);
  const [rsError, setRsError] = useState("");

  const fetchDetails = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get(`/bookings/${bookingId}`);
      setBooking(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load booking details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [bookingId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const handleStartService = async () => {
    const code = otpInput.trim();
    if (!/^\d{4}$/.test(code)) {
      setOtpError("Enter the 4-digit code from the customer");
      return;
    }
    setStartingService(true);
    setOtpError("");
    try {
      const res = await API.patch(`/bookings/${bookingId}/start-service`, { otp: code });
      setBooking((prev) => ({ ...prev, ...res.data }));
      setOtpInput("");
      showToast("Service started — the clock is running!", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Could not start service";
      setOtpError(msg);
      showToast(msg, "error");
    } finally {
      setStartingService(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel this booking session?")) return;
    setCancelling(true);
    try {
      const res = await API.patch(`/bookings/${bookingId}/cancel`);
      setBooking((prev) => ({ ...prev, ...res.data }));
      showToast("Booking cancelled successfully", "info");
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to cancel booking", "error");
    } finally {
      setCancelling(false);
    }
  };

  /* ── Reschedule helpers ── */
  const dayInputStr = (d) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
  };
  const addHours = (t, h) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    const total = Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(h) * 60);
    if (!Number.isFinite(total)) return "";
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };
  const fmtSlot12 = (t) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
    if (!m) return t;
    let h = Number(m[1]);
    const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  };

  // Once the service hours begin, Cancel and Reschedule disappear — the
  // session is under way and can no longer be moved or called off here.
  const serviceStarted = hasServiceHoursStarted(booking);
  const canReschedule =
    user?.role === "customer" &&
    ["requested", "accepted", "confirmed"].includes(booking?.status) &&
    !serviceStarted;

  // Latest "Rescheduled …" timeline note, if the time was ever moved.
  const reschedNote =
    [...(booking?.statusHistory || [])]
      .reverse()
      .find((h) => String(h.note || "").startsWith("Rescheduled"))?.note || "";
  const reschedOldSlot = (() => {
    const m = String(reschedNote).match(/from (.*) to (.*) by /);
    return m ? m[1] : "";
  })();

  const loadFreeStarts = async (dateStr) => {
    const cuid = booking?.cook?._id || booking?.cook;
    if (!cuid || !dateStr || !booking?.durationHours) {
      setFreeStarts([]);
      return;
    }
    setStartsLoading(true);
    try {
      const res = await API.get(
        `/availability/${cuid}?date=${dateStr}&durationHours=${booking.durationHours}`
      );
      const list = Array.isArray(res.data) ? res.data : res.data?.slots || [];
      setFreeStarts(list);
    } catch {
      setFreeStarts([]);
    } finally {
      setStartsLoading(false);
    }
  };

  const openReschedule = () => {
    setRsError("");
    setRsStart("");
    const d = dayInputStr(booking.date) || localTodayStr();
    setRsDate(d);
    setReschedOpen(true);
    loadFreeStarts(d);
  };

  const handleReschedule = async () => {
    if (!rsDate || !rsStart) {
      setRsError("Pick a new date and start time");
      return;
    }
    setReschedSaving(true);
    setRsError("");
    try {
      const res = await API.patch(`/bookings/${bookingId}/reschedule`, {
        date: rsDate,
        startTime: rsStart,
      });
      setBooking((prev) => ({ ...prev, ...res.data }));
      setReschedOpen(false);
      showToast(`Moved to ${rsDate} ${fmtSlot12(rsStart)} — your cook has been notified`, "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Could not reschedule — try another time";
      setRsError(msg);
      showToast(msg, "error");
    } finally {
      setReschedSaving(false);
    }
  };

  const reschedWa = bookingRescheduleWhatsAppUrl({
    cookPhone: booking?.cook?.phone,
    customerName: user?.name,
    customerPhone: user?.phone,
    booking,
    oldSlot: reschedOldSlot,
  });

  const getStatusBadge = (status) => {
    if (booking?.hoursCompleted && ["accepted", "confirmed", "in_progress"].includes(status)) {
      return <span className="badge badge-amber">Hours Complete ⏰</span>;
    }
    if (booking?.cookArrived && ["accepted", "confirmed", "in_progress"].includes(status)) {
      return <span className="badge badge-emerald">Cook Arrived ✓</span>;
    }
    switch (status) {
      case "requested":
        return <span className="badge badge-amber">Awaiting Cook Acceptance</span>;
      case "accepted":
      case "confirmed":
        return <span className="badge badge-blue">Confirmed & Scheduled</span>;
      case "in_progress":
        return <span className="badge badge-purple">Session In Progress</span>;
      case "completed":
        return <span className="badge badge-emerald">Completed</span>;
      case "rejected":
        return <span className="badge badge-rose">Declined by Cook</span>;
      case "cancelled":
        return <span className="badge badge-slate">Cancelled</span>;
      default:
        return <span className="badge badge-slate">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading-spinner-wrapper">
          <div className="spinner"></div>
          <p style={{ color: "var(--slate-500)", fontWeight: 600 }}>Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="dashboard-container">
        <Link to="/dashboard/my-bookings" className="back-link-bar" style={{ marginBottom: "1rem" }}>
          <ArrowLeft size={16} /> Back to My Bookings
        </Link>
        <div className="error-alert-banner">
          <AlertCircle size={18} /> {error || "Booking not found"}
        </div>
      </div>
    );
  }

  const serviceInfo = SERVICE_DETAILS[booking.serviceType] || {
    label: (booking.serviceType || "").replace(/_/g, " "),
  };
  const cookLoc =
    booking.cookLocation?.lat != null
      ? booking.cookLocation
      : booking.effectiveCookLocation?.lat != null
        ? booking.effectiveCookLocation
        : booking.cookLiveLocation?.lat != null
          ? booking.cookLiveLocation
          : null;
  const trackUrl = cookLiveMapsUrl(cookLoc);
  const end = sessionEndDate(booking);
  const remainingLabel = end ? formatRemaining(end, now) : null;
  const isActive = ["requested", "accepted", "confirmed", "in_progress"].includes(booking.status);
  // OTP service-start state.
  const sessionLive = ["accepted", "confirmed", "in_progress"].includes(booking.status);
  const showOtpCard =
    user?.role === "customer" && sessionLive && booking.serviceOtp && !booking.serviceStartedAt;
  const showOtpForm =
    user?.role === "cook" && sessionLive && !booking.serviceStartedAt;
  const startedAtLabel = booking.serviceStartedAt
    ? new Date(booking.serviceStartedAt).toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      })
    : "";

  const waToCook = bookingWhatsAppUrl({
    cookPhone: booking.cook?.phone,
    customerName: user?.name,
    customerPhone: user?.phone,
    booking,
  });
  // After payment the cook needs the customer's name, number and location —
  // prefer the server-built job sheet link, fall back to the client builder.
  const isPaid = booking.payment?.status === "paid";
  const jobSheetWa = isPaid
    ? booking.cookWhatsappUrl ||
      bookingCookJobWhatsAppUrl({
        cookPhone: booking.cook?.phone,
        customerName: user?.name,
        customerPhone: user?.phone,
        booking,
      })
    : null;
  const waToSelf = bookingCustomerWhatsAppUrl({
    customerPhone: user?.phone,
    cookName: booking.cook?.name,
    cookPhone: booking.cook?.phone,
    cookLocation: cookLoc,
    booking,
  });
  const hoursWa =
    booking.hoursCompleted &&
    (booking.hoursCompleteWhatsappUrl ||
      hoursCompleteWhatsAppUrl({
        toPhone: user?.phone,
        booking,
        cookName: booking.cook?.name,
        cookPhone: booking.cook?.phone,
        customerName: user?.name,
      }));

  return (
    <div className="dashboard-container">
      <Link to="/dashboard/my-bookings" className="back-link-bar" style={{ marginBottom: "1rem" }}>
        <ArrowLeft size={16} /> Back to My Bookings
      </Link>

      {/* Header */}
      <div className="dashboard-header-row">
        <div>
          <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
            <Sparkles size={14} /> Booking Details
          </span>
          <h1>{serviceInfo.label}</h1>
          <p style={{ color: "var(--slate-600)", margin: 0 }}>
            Booking #{booking._id?.substring(18)} • Booked {booking.createdAt ? timeAgo(booking.createdAt) : ""}
          </p>
        </div>
        <div>{getStatusBadge(booking.status)}</div>
      </div>

      {/* Arrival / hours banners */}
      {booking.cookArrived && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            background: "var(--accent-emerald-light, #ecfdf5)",
            border: "1px solid var(--accent-emerald, #10b981)",
            borderRadius: "10px", padding: "0.65rem 0.9rem",
            marginBottom: "0.75rem", fontSize: "0.88rem", fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} style={{ color: "var(--accent-emerald, #10b981)", flexShrink: 0 }} />
          <span>
            Your cook {booking.cook?.name ? `${booking.cook.name} ` : ""}has reached your location
            {booking.cookArrivedAt ? ` • ${timeAgo(booking.cookArrivedAt)}` : ""}!
          </span>
        </div>
      )}
      {booking.hoursCompleted && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            background: "#fef3c7", border: "1px solid #f59e0b",
            borderRadius: "10px", padding: "0.65rem 0.9rem",
            marginBottom: "0.75rem", fontSize: "0.88rem", fontWeight: 600,
          }}
        >
          <BellRing size={18} style={{ color: "#b45309", flexShrink: 0 }} />
          <span>Your cooking hours are complete! Please review your session below.</span>
        </div>
      )}
      {reschedNote && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            background: "#eff6ff", border: "1px solid #93c5fd",
            borderRadius: "10px", padding: "0.65rem 0.9rem",
            marginBottom: "0.75rem", fontSize: "0.88rem", fontWeight: 600,
            color: "#1e40af", flexWrap: "wrap",
          }}
        >
          <Clock size={18} style={{ color: "#2563eb", flexShrink: 0 }} />
          <span>⏰ Time changed — {reschedNote}. Duration and fee unchanged.</span>
          {user?.role === "customer" && reschedWa && (
            <a href={reschedWa} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }}>
              <MessageCircle size={15} /> Send update to cook
            </a>
          )}
        </div>
      )}

      {/* Reschedule panel (customer moves upcoming bookings; duration fixed) */}
      {reschedOpen && canReschedule && (
        <div className="profile-card-block" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Calendar size={18} style={{ color: "var(--primary)" }} /> Move to a new time
          </h3>
          <p style={{ margin: "0 0 0.75rem", color: "var(--slate-600)", fontSize: "0.88rem" }}>
            Session stays {booking.durationHours} hr{Number(booking.durationHours) === 1 ? "" : "s"} — only the date and start
            time change, so the fee and any payment stay exactly as they are. Your cook is notified instantly.
          </p>
          <div className="booking-metadata-grid" style={{ marginBottom: "0.75rem" }}>
            <div className="meta-field">
              <label>New date</label>
              <input
                type="date"
                className="form-control"
                value={rsDate}
                min={localTodayStr()}
                onChange={(e) => {
                  setRsDate(e.target.value);
                  setRsStart("");
                  setRsError("");
                  loadFreeStarts(e.target.value);
                }}
              />
            </div>
            <div className="meta-field">
              <label>New start time</label>
              {startsLoading ? (
                <span style={{ fontSize: "0.88rem", color: "var(--slate-500)" }}>Checking free times…</span>
              ) : freeStarts.length === 0 ? (
                <span style={{ fontSize: "0.88rem", color: "var(--slate-500)" }}>
                  No {booking.durationHours}-hr starts that day — try another date.
                </span>
              ) : (
                <div className="slot-list" role="radiogroup" aria-label="Free start times">
                  {freeStarts.map((s) => (
                    <button
                      key={s.startTime}
                      type="button"
                      role="radio"
                      aria-checked={rsStart === s.startTime}
                      className={`slot-chip ${rsStart === s.startTime ? "selected" : ""}`}
                      onClick={() => {
                        setRsStart(s.startTime);
                        setRsError("");
                      }}
                    >
                      <Clock size={15} /> {fmtSlot12(s.startTime)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {rsStart && (
            <p style={{ fontSize: "0.88rem", color: "var(--slate-600)", margin: "0 0 0.75rem" }}>
              New slot: <strong>{rsDate} · {fmtSlot12(rsStart)} – {fmtSlot12(addHours(rsStart, booking.durationHours))}</strong>
            </p>
          )}
          {rsError && (
            <div className="error-alert-banner" style={{ marginBottom: "0.75rem" }}>
              <AlertCircle size={16} /> {rsError}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!rsStart || reschedSaving}
              onClick={handleReschedule}
            >
              <CheckCircle2 size={16} /> {reschedSaving ? "Moving…" : "Confirm new time"}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setReschedOpen(false)}
              disabled={reschedSaving}
            >
              Keep current time
            </button>
          </div>
        </div>
      )}

      {/* Service-start OTP: customer shows it, cook enters it. The hours
          below only start counting once the code is verified. */}
      {showOtpCard && (
        <div
          className="profile-card-block"
          style={{ marginBottom: "1.25rem", textAlign: "center", border: "2px dashed var(--primary)" }}
        >
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
            <Clock size={18} style={{ color: "var(--primary)" }} /> Your service-start code
          </h3>
          <div
            style={{
              fontSize: "2.4rem", fontWeight: 800, letterSpacing: "0.35em",
              color: "var(--primary-800)", margin: "0.25rem 0 0.5rem", paddingLeft: "0.35em",
            }}
            aria-label={`Your service start code is ${booking.serviceOtp}`}
          >
            {booking.serviceOtp}
          </div>
          <p style={{ margin: 0, fontSize: "0.88rem", color: "var(--slate-600)" }}>
            Share this 4-digit code with {booking.cook?.name || "your cook"} when they arrive —
            your cooking hours start counting only after they enter it.
          </p>
        </div>
      )}

      {booking.serviceStartedAt && sessionLive && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            background: "var(--accent-emerald-light, #ecfdf5)",
            border: "1px solid var(--accent-emerald, #10b981)",
            borderRadius: "10px", padding: "0.65rem 0.9rem",
            marginBottom: "0.75rem", fontSize: "0.88rem", fontWeight: 600,
          }}
        >
          <CheckCircle2 size={18} style={{ color: "var(--accent-emerald, #10b981)", flexShrink: 0 }} />
          <span>
            Service started {startedAtLabel}
            {end ? ` • ends about ${formatRemaining(end, now)}` : ""} — hours are being counted.
          </span>
        </div>
      )}

      {showOtpForm && (
        <div className="profile-card-block" style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Clock size={18} style={{ color: "var(--primary)" }} /> Start service with customer OTP
          </h3>
          <p style={{ margin: "0 0 0.75rem", color: "var(--slate-600)", fontSize: "0.88rem" }}>
            Ask {booking.customer?.name || "the customer"} for the 4-digit code on their booking —
            entering it marks your arrival and starts the {booking.durationHours}-hour clock.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              className="form-control"
              style={{ maxWidth: 140, textAlign: "center", fontSize: "1.3rem", fontWeight: 800, letterSpacing: "0.25em" }}
              placeholder="••••"
              value={otpInput}
              onChange={(e) => {
                setOtpInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                setOtpError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleStartService();
                }
              }}
              aria-label="4-digit service start code"
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={startingService || otpInput.trim().length !== 4}
              onClick={handleStartService}
            >
              <CheckCircle2 size={16} /> {startingService ? "Starting…" : "Start Service"}
            </button>
          </div>
          {otpError && (
            <div className="error-alert-banner" style={{ marginTop: "0.75rem" }}>
              <AlertCircle size={16} /> {otpError}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem" }}>
        {/* Cook card */}
        <div className="profile-card-block">
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ChefHat size={18} style={{ color: "var(--primary)" }} /> Your Cook
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginBottom: "1rem" }}>
            <div
              style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--primary-gradient)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "1.4rem", fontWeight: 800, flexShrink: 0,
              }}
            >
              {booking.cook?.name?.[0]?.toUpperCase() || "C"}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{booking.cook?.name || "Assigned Cook"}</div>
              <div style={{ fontSize: "0.85rem", color: "var(--slate-500)" }}>
                {[booking.cookServiceArea && `${booking.cookServiceArea}`, booking.cookRate != null && `${formatCurrency(booking.cookRate)}/hr`]
                  .filter(Boolean)
                  .join(" • ") || "Verified cook"}
              </div>
              {booking.cook?.phone && (
                <div style={{ fontSize: "0.85rem", color: "var(--slate-600)", display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.2rem" }}>
                  <Phone size={13} /> {booking.cook.phone}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {booking.cook?.phone && (
              <a href={`tel:${booking.cook.phone}`} className="btn btn-outline btn-sm">
                <Phone size={15} /> Call
              </a>
            )}
            {(jobSheetWa || waToCook) && (
              <a href={jobSheetWa || waToCook} target="_blank" rel="noreferrer" className="btn btn-success btn-sm">
                <MessageCircle size={15} /> {jobSheetWa ? "Send details to cook" : "WhatsApp Cook"}
              </a>
            )}
          </div>
        </div>

        {/* Session card */}
        <div className="profile-card-block">
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Calendar size={18} style={{ color: "var(--primary)" }} /> Session
          </h3>
          <div className="booking-metadata-grid">
            <div className="meta-field">
              <label>Date</label>
              <span>{formatDate(booking.date)}</span>
            </div>
            <div className="meta-field">
              <label>Time</label>
              <span>{booking.startTime} - {booking.endTime}</span>
            </div>
            <div className="meta-field">
              <label>Duration</label>
              <span>{booking.durationHours ? `${booking.durationHours} hrs` : "—"}</span>
            </div>
            <div className="meta-field">
              <label>Guests</label>
              <span>{booking.guests || "—"}</span>
            </div>
          </div>
          {!booking.hoursCompleted && isActive && remainingLabel && (
            <div style={{ fontSize: "0.85rem", color: "var(--slate-600)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <Clock size={15} /> Cooking time: {remainingLabel}
            </div>
          )}
        </div>
      </div>

      {/* Venue card */}
      <div className="profile-card-block" style={{ marginTop: "1.25rem" }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <MapPin size={18} style={{ color: "var(--primary)" }} /> Venue
        </h3>
        <p style={{ margin: "0 0 0.75rem", color: "var(--slate-700)" }}>{booking.address}</p>
        {(booking.addressDetails?.flatNo || booking.addressDetails?.society || booking.addressDetails?.landmark || booking.addressDetails?.city) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {booking.addressDetails.flatNo && <span className="badge badge-slate">Flat: {booking.addressDetails.flatNo}</span>}
            {booking.addressDetails.society && <span className="badge badge-slate">{booking.addressDetails.society}</span>}
            {booking.addressDetails.landmark && <span className="badge badge-slate">Near {booking.addressDetails.landmark}</span>}
            {booking.addressDetails.city && <span className="badge badge-slate">{booking.addressDetails.city}</span>}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {mapsNavigateUrl(booking) && (
            <a href={mapsNavigateUrl(booking)} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
              <Navigation size={15} /> Open in Google Maps
            </a>
          )}
          {trackUrl && (
            <a href={trackUrl} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
              <Navigation size={15} /> Track Cook's Live Location
            </a>
          )}
          <Link to={`/track/${booking._id}`} className="btn btn-primary btn-sm">
            <Navigation size={15} /> Live Track
          </Link>
        </div>
      </div>

      {/* Order + payment */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.25rem", marginTop: "1.25rem" }}>
        <div className="profile-card-block">
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <User size={18} style={{ color: "var(--primary)" }} /> Your Order
          </h3>
          {booking.selectedItems?.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
              {booking.selectedItems.map((item, i) => (
                <span key={i} className="badge badge-amber">{item}</span>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--slate-500)", fontSize: "0.9rem" }}>No dishes listed.</p>
          )}
          {booking.notes && (
            <div style={{ fontSize: "0.88rem", color: "var(--slate-600)", background: "var(--slate-50)", padding: "0.6rem 0.9rem", borderRadius: "var(--radius-sm)" }}>
              <strong>Notes:</strong> {booking.notes}
            </div>
          )}
        </div>

        <div className="profile-card-block">
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Receipt size={18} style={{ color: "var(--primary)" }} /> Payment
          </h3>
          {Number(booking.slabPrice) > 0 && (
            <div className="price-rows" style={{ marginBottom: "0.75rem" }}>
              <div className="price-row">
                <span>Service Price · {booking.durationHours} hr{Number(booking.durationHours) === 1 ? "" : "s"}</span>
                <span>{formatCurrency(booking.slabPrice)}</span>
              </div>
              {booking.couponCode ? (
                <div className="price-row discount">
                  <span>Coupon {booking.couponCode}</span>
                  <span>−{formatCurrency(booking.discount)}</span>
                </div>
              ) : null}
            </div>
          )}
          {user?.role === "cook" && Number(booking.cookPayout) > 0 && (
            <div style={{ fontSize: "0.85rem", color: "var(--slate-600)", background: "var(--slate-50)", padding: "0.55rem 0.85rem", borderRadius: "var(--radius-sm)", marginBottom: "0.75rem" }}>
              Your payout (90%): <strong style={{ color: "var(--accent-emerald)" }}>{formatCurrency(booking.cookPayout)}</strong>
            </div>
          )}
          <div className="booking-metadata-grid">
            <div className="meta-field">
              <label>{booking.payment?.status === "paid" && booking.payment?.razorpayPaymentId ? "Total Paid" : "Amount Due"}</label>
              <span style={{ color: "var(--primary)", fontWeight: 800 }}>
                {booking.payment?.status === "paid" && booking.payment?.razorpayPaymentId
                  ? formatCurrency(booking.payment.paidAmount || 0)
                  : `${formatCurrency(booking.amount)} (pending — no payment ID yet)`}
              </span>
            </div>
            <div className="meta-field">
              <label>Status</label>
              <span>
                {booking.payment?.status === "paid" && booking.payment?.razorpayPaymentId
                  ? <span className="badge badge-emerald">Paid ✓</span>
                  : <span className="badge badge-slate">{booking.payment?.status || "—"}</span>}
              </span>
            </div>
          </div>
          {booking.payment?.razorpayPaymentId && (
            <div style={{ fontSize: "0.82rem", color: "var(--slate-500)" }}>
              Payment ID: {booking.payment.razorpayPaymentId}
              {booking.payment?.paidAt ? ` • ${timeAgo(booking.payment.paidAt)}` : ""}
            </div>
          )}
          {booking.payment?.refundStatus && booking.payment.refundStatus !== "none" && (
            <div style={{ marginTop: "0.6rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
              {booking.payment.refundStatus === "processed" && (
                <span className="badge badge-emerald">Refund processed ✓</span>
              )}
              {booking.payment.refundStatus === "pending" && (
                <span className="badge badge-amber">Refund processing…</span>
              )}
              {booking.payment.refundStatus === "failed" && (
                <span className="badge badge-rose">Refund failed — contact support</span>
              )}
              {booking.payment.refundStatus === "manual" && (
                <span className="badge badge-slate">Refund settled manually</span>
              )}
              {booking.payment.refundAmount > 0 && (
                <span style={{ color: "var(--slate-600)", fontWeight: 700 }}>
                  {formatCurrency(booking.payment.refundAmount)}
                  {booking.payment?.refundedAt ? ` • ${timeAgo(booking.payment.refundedAt)}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Timeline */}
      {booking.statusHistory?.length > 0 && (
        <div className="profile-card-block" style={{ marginTop: "1.25rem" }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <History size={18} style={{ color: "var(--primary)" }} /> Status Timeline
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {booking.statusHistory.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.88rem" }}>
                <span className="badge badge-slate">{String(h.status).replace(/_/g, " ").toUpperCase()}</span>
                <span style={{ color: "var(--slate-500)" }}>
                  {h.timestamp ? new Date(h.timestamp).toLocaleString() : ""}
                  {h.note ? ` • ${h.note}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="booking-item-card" style={{ marginTop: "1.25rem" }}>
        <div className="booking-actions-row">
          {canReschedule && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => (reschedOpen ? setReschedOpen(false) : openReschedule())}
            >
              <Calendar size={16} /> {reschedOpen ? "Close reschedule" : "Reschedule"}
            </button>
          )}
          {isActive && !serviceStarted && user?.role !== "admin" && (
            <button className="btn btn-danger-outline btn-sm" onClick={handleCancel} disabled={cancelling}>
              <XCircle size={16} />{" "}
              {cancelling
                ? "Cancelling..."
                : booking.status === "requested"
                  ? "Cancel Request"
                  : "Cancel Booking"}
            </button>
          )}
          {waToSelf && (
            <a href={waToSelf} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              <MessageCircle size={16} /> My WhatsApp
            </a>
          )}
          {hoursWa && (
            <a href={hoursWa} target="_blank" rel="noreferrer" className="btn btn-success btn-sm">
              <MessageCircle size={16} /> Hours Done on WhatsApp
            </a>
          )}
          <Link to={`/track/${booking._id}`} className="btn btn-outline btn-sm">
            <Navigation size={16} /> Live Track Cook
          </Link>
        </div>
          {booking.status === "completed" && user?.role === "customer" && (
            <ReviewForm bookingId={booking._id} existingReview={booking.review} onSubmitted={fetchDetails} />
          )}
          {booking.status === "completed" && booking.review && user?.role !== "customer" && (
            <div style={{ marginTop: "1rem", padding: "1rem", background: "var(--slate-50)", border: "1px solid var(--slate-200)", borderRadius: "var(--radius-lg)", fontSize: "0.9rem" }}>
              <strong>Customer rating: {booking.review.rating}/5</strong>
              {booking.review.comment && <div style={{ marginTop: "0.3rem", color: "var(--slate-600)" }}>{booking.review.comment}</div>}
            </div>
          )}
      </div>
    </div>
  );
};

export default BookingDetails;
