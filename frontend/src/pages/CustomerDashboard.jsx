import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import API from "../api/axios";
import { useFetch } from "../hooks/useFetch";
import { useSelector } from "react-redux";
import { useShowToast } from "../store/hooks";
import ReviewForm from "../components/ReviewForm";
import { formatCurrency, formatDate, bookingCustomerWhatsAppUrl, bookingReviewWhatsAppUrl, sessionEndDate, hasServiceHoursStarted, formatRemaining, hoursCompleteWhatsAppUrl, playAlarmSound } from "../utils/constants";
import {
  Calendar,
  Clock,
  MapPin,
  Navigation,
  XCircle,
  CheckCircle2,
  AlertCircle,
  Search,
  MessageCircle,
  Star,
  Sparkles,
  ChefHat,
  BellRing,
  Trash2,
} from "lucide-react";

const CustomerDashboard = () => {
  const { data: bookings, loading, error, refetch } = useFetch("/bookings/my");
  const user = useSelector((s) => s.auth.user);
  const showToast = useShowToast();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState("all");
  const [cancellingId, setCancellingId] = useState(null);
  const seenArrived = useRef(new Set());
  const seenHoursDone = useRef(new Set());
  const seenCompleted = useRef(new Set());
  const firstLoadDone = useRef(false);
  const [now, setNow] = useState(Date.now());

  // Friendly greeting for the header.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.name?.split(" ")[0] || "there";

  // Poll bookings so arrivals + hours-complete alarms fire without refresh.
  useEffect(() => {
    const id = setInterval(() => refetch(), 30000);
    return () => clearInterval(id);
  }, [refetch]);

  // Keep the countdown fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Toast once per booking on new transitions (skip pre-existing state on
  // first load to avoid noise).
  useEffect(() => {
    if (!bookings?.length) return;
    if (!firstLoadDone.current) {
      bookings.forEach((b) => {
        if (b.cookArrived) seenArrived.current.add(b._id);
        if (b.hoursCompleted) seenHoursDone.current.add(b._id);
        if (b.status === "completed") seenCompleted.current.add(b._id);
      });
      firstLoadDone.current = true;
      return;
    }
    bookings.forEach((b) => {
      if (b.cookArrived && !seenArrived.current.has(b._id)) {
        seenArrived.current.add(b._id);
        showToast(`Your cook ${b.cook?.name || ""} has reached your location!`, "success", 6000);
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Cook has arrived!", {
              body: `${b.cook?.name || "Your cook"} has reached your location.`,
            });
          }
        } catch {
          // optional
        }
      }
      if (b.hoursCompleted && !seenHoursDone.current.has(b._id)) {
        seenHoursDone.current.add(b._id);
        showToast("Your cooking hours are complete! Please review your session.", "warning", 8000);
        playAlarmSound();
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Cooking hours complete!", {
              body: "Your booked cooking hours are complete. Please review your session.",
            });
          }
        } catch {
          // optional
        }
      }
      // Service complete: prompt the customer to rate the cook (website +
      // WhatsApp via the banner button on the card).
      if (b.status === "completed" && !seenCompleted.current.has(b._id)) {
        seenCompleted.current.add(b._id);
        showToast(`Service complete! Please rate ${b.cook?.name || "your cook"}.`, "success", 8000);
        try {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Service complete — rate your cook!", {
              body: `How was ${b.cook?.name || "your cook"}? Please leave a rating.`,
            });
          }
        } catch {
          // optional
        }
      }
    });
  }, [bookings, showToast]);

  const getStatusBadge = (status, booking) => {
    const isBooked = ["accepted", "confirmed", "in_progress"].includes(status);
    const isRequested = status === "requested";
    const hoursCompleted = booking?.hoursCompleted;
    const cookArrived = booking?.cookArrived;

    // Hours-complete badge takes priority when active
    if (hoursCompleted && isBooked) {
      return <span className="badge badge-amber">Hours Complete ⏰</span>;
    }
    if (cookArrived && isBooked) {
      return <span className="badge badge-emerald">Cook Arrived ✓</span>;
    }
    // Accepted but payment window still open → send the customer to pay.
    if (status === "accepted" && booking?.payment?.status !== "paid") {
      return <span className="badge badge-amber">Action Needed — Pay to Confirm</span>;
    }
    // Booked / active statuses
    if (isBooked) {
      return <span className="badge badge-blue">Confirmed & Scheduled</span>;
    }
    if (isRequested) {
      return <span className="badge badge-amber">Awaiting Cook Acceptance</span>;
    }
    // Pending / transitional
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
      case "expired":
        return <span className="badge badge-slate">Expired — Cook Didn't Respond</span>;
      case "cancelled":
        return <span className="badge badge-slate">Cancelled</span>;
      default:
        return <span className="badge badge-slate">{status}</span>;
    }
  };

  // Clicking anywhere on a booking card (except its own buttons/links)
  // opens that booking's details page.
  const openBooking = (e, bookingId) => {
    if (e.target.closest("button, a, input, select, textarea")) return;
    navigate(`/bookings/${bookingId}`);
  };
  const openBookingKey = (e, bookingId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      navigate(`/bookings/${bookingId}`);
    }
  };

  const handleCancel = async (id) => {
    if (cancellingId) return;
    if (!window.confirm("Are you sure you want to cancel this booking session?")) return;
    setCancellingId(id);
    try {
      await API.patch(`/bookings/${id}/cancel`);
      showToast("Booking cancelled successfully", "info");
      refetch();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to cancel booking", "error");
    } finally {
      setCancellingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this booking permanently from your history? This can't be undone.")) return;
    try {
      await API.delete(`/bookings/${id}`);
      showToast("Booking deleted", "info");
      refetch();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to delete booking", "error");
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner-wrapper">
        <div className="spinner"></div>
        <p style={{ color: "var(--slate-500)", fontWeight: 600 }}>Loading your bookings...</p>
      </div>
    );
  }

  // Calculate Metrics (Awaiting vs Confirmed are disjoint)
  const totalCount = bookings?.length || 0;
  const pendingCount = bookings?.filter((b) => b.status === "requested")?.length || 0;
  const confirmedCount = bookings?.filter((b) => ["accepted", "confirmed", "in_progress"].includes(b.status))?.length || 0;
  const activeCount = pendingCount + confirmedCount;
  const completedCount = bookings?.filter((b) => b.status === "completed")?.length || 0;
  const cancelledCount = bookings?.filter((b) => ["cancelled", "rejected", "expired"].includes(b.status))?.length || 0;
  const totalSpent = bookings?.reduce((acc, b) => (b.status === "completed" && b.payment?.status === "paid" && b.payment?.razorpayPaymentId ? acc + Number(b.payment.paidAmount || 0) : acc), 0) || 0;

  // Next upcoming active booking (soonest date) highlighted at the top.
  const nextUp = (bookings || [])
    .filter((b) => ["requested", "accepted", "confirmed", "in_progress"].includes(b.status))
    .slice()
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null;

  // Filter bookings (Awaiting and Confirmed are disjoint views)
  const filteredBookings = bookings
    ? bookings.filter((b) => {
        if (activeFilter === "pending") return b.status === "requested";
        if (activeFilter === "active") return ["accepted", "confirmed", "in_progress"].includes(b.status);
        if (activeFilter === "completed") return b.status === "completed";
        if (activeFilter === "cancelled") return ["cancelled", "rejected", "expired"].includes(b.status);
        return true;
      })
    : [];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header-row">
        <div>
          <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
            <Sparkles size={14} /> {greeting}, {firstName}!
          </span>
          <h1>My Cooking Sessions</h1>
          <p style={{ color: "var(--slate-600)", margin: 0 }}>
            {pendingCount > 0
              ? `Good news — you have ${pendingCount} request${pendingCount === 1 ? "" : "s"} with a cook. We'll let you know as soon as they accept.`
              : "All your home-cooking sessions live here — requests, upcoming visits, and past favourites."}
          </p>
        </div>
      </div>

      {error && (
        <div className="error-alert-banner">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Stats Cards */}
      <div className="dashboard-stats-grid">
        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
            <Calendar size={26} />
          </div>
          <div>
            <div className="stat-metric-number">{totalCount}</div>
            <div className="stat-metric-title">My Sessions</div>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
            <Clock size={26} />
          </div>
          <div>
            <div className="stat-metric-number">{activeCount}</div>
            <div className="stat-metric-title">Coming Up</div>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--accent-emerald-light)", color: "var(--accent-emerald)" }}>
            <CheckCircle2 size={26} />
          </div>
          <div>
            <div className="stat-metric-number">{completedCount}</div>
            <div className="stat-metric-title">Meals Enjoyed</div>
          </div>
        </div>

        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--accent-amber-light)", color: "var(--accent-amber)" }}>
            <Sparkles size={26} />
          </div>
          <div>
            <div className="stat-metric-number">{formatCurrency(totalSpent)}</div>
            <div className="stat-metric-title">Total Spent</div>
          </div>
        </div>
      </div>

      {/* Tabs Filter Bar */}
      <div className="tabs-navigation-bar">
        <button
          className={`tab-btn ${activeFilter === "all" ? "active" : ""}`}
          onClick={() => setActiveFilter("all")}
        >
          All ({totalCount})
        </button>
        <button
          className={`tab-btn ${activeFilter === "pending" ? "active" : ""}`}
          onClick={() => setActiveFilter("pending")}
        >
          Waiting for Cook ({pendingCount})
        </button>
        <button
          className={`tab-btn ${activeFilter === "active" ? "active" : ""}`}
          onClick={() => setActiveFilter("active")}
        >
          Upcoming ({confirmedCount})
        </button>
        <button
          className={`tab-btn ${activeFilter === "completed" ? "active" : ""}`}
          onClick={() => setActiveFilter("completed")}
        >
          Past Meals ({completedCount})
        </button>
        <button
          className={`tab-btn ${activeFilter === "cancelled" ? "active" : ""}`}
          onClick={() => setActiveFilter("cancelled")}
        >
          Cancelled ({cancelledCount})
        </button>
      </div>

      {/* Next-up highlight: plain-language next step */}
      {nextUp && activeFilter !== "completed" && activeFilter !== "cancelled" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "white",
            border: "1px solid var(--border-subtle)",
            borderLeft: "4px solid var(--primary)",
            borderRadius: "12px",
            padding: "0.85rem 1.1rem",
            marginBottom: "1.25rem",
            boxShadow: "var(--shadow-sm)",
            flexWrap: "wrap",
          }}
        >
          <Calendar size={20} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--slate-500)" }}>
              Next up
            </div>
            <div style={{ fontSize: "0.95rem", fontWeight: 700 }}>
              {nextUp.cook?.name || "Your cook"} · {formatDate(nextUp.date)} · {nextUp.startTime}–{nextUp.endTime}
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--slate-600)" }}>
              {nextUp.status === "requested"
                ? "Waiting for the cook to accept — no action needed from you."
                : nextUp.cookArrived
                  ? "Your cook has arrived — enjoy your session."
                  : "Confirmed — use Track Live on the day to follow your cook."}
            </div>
          </div>
          {/* Track is only meaningful once the cook accepted — for requests that
              are still waiting, Details is the only useful action. */}
          {["accepted", "confirmed"].includes(nextUp.status) && (
            <Link to={`/track/${nextUp._id}`} className="btn btn-primary btn-sm">
              <Navigation size={15} /> Track
            </Link>
          )}
          <Link to={`/bookings/${nextUp._id}`} className="btn btn-outline btn-sm">
            Details
          </Link>
        </div>
      )}
      {filteredBookings.length > 0 ? (
        <div className="bookings-list-modern">
          {filteredBookings.map((booking) => (
            <div
              key={booking._id}
              className="booking-item-card clickable"
              onClick={(e) => openBooking(e, booking._id)}
              onKeyDown={(e) => openBookingKey(e, booking._id)}
              role="button"
              tabIndex={0}
              aria-label={`Open booking details for ${booking.cook?.name || "booking"}`}
            >
              <div className="booking-item-top">
                <div className="booking-party-info">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <ChefHat size={20} style={{ color: "var(--primary)" }} />
                    <h3 style={{ margin: 0 }}>
                      Cook: {booking.cook?.name || "Assigned Cook"}
                    </h3>
                  </div>
                  <span style={{ fontSize: "0.85rem", color: "var(--slate-500)" }}>
                    Ref #{booking._id?.substring(18).toUpperCase()}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                  <div>{getStatusBadge(booking.status, booking)}</div>
                  {/* Removable bookings (never accepted / cancelled) get a
                      compact delete control in the card's top-right corner. */}
                  {["requested", "rejected", "expired", "cancelled"].includes(booking.status) && (
                    <button
                      type="button"
                      className="booking-delete-btn"
                      onClick={() => handleDelete(booking._id)}
                      title="Delete this booking permanently"
                      aria-label="Delete this booking permanently"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>

              {booking.status === "requested" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "#fffbeb",
                    border: "1px solid #f59e0b",
                    borderRadius: "10px",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#92400e",
                  }}
                >
                  <Clock size={18} style={{ color: "#b45309", flexShrink: 0 }} />
                  <span>
                    Request sent to <strong>{booking.cook?.name || "cook"}</strong> — waiting for them to Accept.
                    <br />
                    The slot is booked only after they accept.
                  </span>
                </div>
              )}

              {["accepted", "confirmed"].includes(booking.status) && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--accent-emerald-light, #ecfdf5)",
                    border: "1px solid var(--accent-emerald, #10b981)",
                    borderRadius: "10px",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#065f46",
                  }}
                >
                  <CheckCircle2 size={18} style={{ color: "var(--accent-emerald, #10b981)", flexShrink: 0 }} />
                  <span>
                    <strong>Booked!</strong> {booking.cook?.name || "Your cook"} accepted your request.
                    {booking.cook?.phone && (
                      <>
                        {" "}Call them at <a href={`tel:${booking.cook.phone}`}>{booking.cook.phone}</a>.
                      </>
                    )}
                    <br />
                    {booking.status === "confirmed"
                      ? "Get the confirmation with live tracking on your WhatsApp below."
                      : "Complete your payment to confirm the booking."}
                  </span>
                </div>
              )}

              {booking.cookArrived && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--accent-emerald-light, #ecfdf5)",
                    border: "1px solid var(--accent-emerald, #10b981)",
                    borderRadius: "10px",
                    padding: "0.65rem 0.9rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.88rem",
                    fontWeight: 600,
                  }}
                >
                  <CheckCircle2 size={18} style={{ color: "var(--accent-emerald, #10b981)", flexShrink: 0 }} />
                  <span>Your cook {booking.cook?.name ? `${booking.cook.name} ` : ""}has reached your location!</span>
                </div>
              )}

{booking.hoursCompleted ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "#fef3c7",
                    border: "1px solid #f59e0b",
                    borderRadius: "10px",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#b45309",
                    flexWrap: "wrap",
                  }}
                >
                  <BellRing size={18} style={{ color: "#b45309", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 200 }}>Your cooking hours are complete! Please review your session.</span>
                  {(() => {
                    const hoursWa =
                      booking.hoursCompleteWhatsappUrl ||
                      hoursCompleteWhatsAppUrl({
                        toPhone: user?.phone,
                        booking,
                        cookName: booking.cook?.name,
                        cookPhone: booking.cook?.phone,
                        customerName: user?.name,
                      });
                    return hoursWa ? (
                      <a
                        href={hoursWa}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-success btn-sm"
                        title="Open WhatsApp with the cooking-hours-complete message"
                      >
                        <MessageCircle size={16} /> Get it on WhatsApp
                      </a>
                    ) : null;
                  })()}
                </div>
              ) : (
                ["accepted", "confirmed", "in_progress"].includes(booking.status) && (() => {
                  const end = sessionEndDate(booking);
                  const label = end ? formatRemaining(end, now) : null;
                  return label ? (
                    <div style={{ fontSize: "0.88rem", color: "var(--slate-600)", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <Clock size={14} /> Cooking time: {label} (ends {booking.endTime})
                    </div>
                  ) : null;
                })()
              )}

              <div className="booking-metadata-grid">
                <div className="meta-field">
                  <label>What You Booked</label>
                  <span>{booking.serviceType?.replace(/_/g, " ").toUpperCase()}</span>
                </div>

                <div className="meta-field">
                  <label>Day</label>
                  <span>{formatDate(booking.date)}</span>
                </div>

                <div className="meta-field">
                  <label>Time</label>
                  <span>{booking.startTime} - {booking.endTime}</span>
                </div>

                <div className="meta-field">
                  <label>Price</label>
                  <span style={{ color: "var(--primary)", fontWeight: 800 }}>
                    {formatCurrency(booking.amount)}
                  </span>
                </div>
              </div>

              {booking.address && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.88rem", color: "var(--slate-600)", marginBottom: "0.75rem" }}>
                  <MapPin size={16} style={{ color: "var(--slate-400)", flexShrink: 0, marginTop: 2 }} />
                  <span>{booking.address}</span>
                </div>
              )}

               {(booking.guests || booking.durationHours || booking.selectedItems?.length > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  {booking.guests && <span className="badge badge-slate">{booking.guests} people</span>}
                  {booking.durationHours && <span className="badge badge-slate">{booking.durationHours} hrs</span>}
                  {booking.selectedItems?.map((item, i) => (
                    <span key={i} className="badge badge-amber">{item}</span>
                  ))}
                </div>
              )}

              {booking.notes && (
                <div style={{ fontSize: "0.85rem", color: "var(--slate-600)", background: "var(--slate-50)", padding: "0.6rem 0.9rem", borderRadius: "var(--radius-sm)", marginBottom: "1rem" }}>
                  <strong>Notes:</strong> {booking.notes}
                </div>
              )}

              {/* Actions — Cancel only shows until service hours begin. */}
              <div className="booking-actions-row">
                {["accepted", "confirmed", "in_progress"].includes(booking.status) &&
                  !hasServiceHoursStarted(booking) && (
                  <button
                    className="btn btn-danger-outline btn-sm"
                    onClick={() => handleCancel(booking._id)}
                    disabled={cancellingId === booking._id}
                  >
                    <XCircle size={16} /> {cancellingId === booking._id ? "Cancelling…" : "Cancel Booking"}
                  </button>
                )}

                {/* Single WhatsApp with all booking info — only for confirmed
                    bookings whose service hours aren't complete yet. */}
                {["confirmed", "in_progress"].includes(booking.status) &&
                  !booking.hoursCompleted &&
                  (() => {
                  const myWaUrl = bookingCustomerWhatsAppUrl({
                    customerPhone: user?.phone,
                    cookName: booking.cook?.name,
                    cookPhone: booking.cook?.phone,
                    cookLocation: null,
                    booking,
                    trackingUrl:
                      typeof window !== "undefined"
                        ? `${window.location.origin}/track/${booking._id}`
                        : undefined,
                  });
                  return myWaUrl ? (
                    <a
                      href={myWaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-success btn-sm"
                    >
                      <MessageCircle size={16} /> WhatsApp
                    </a>
                  ) : null;
                })()}
              </div>

              {/* Rating prompt for completed bookings */}
              {booking.status === "completed" && !booking.review && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--accent-amber-light, #fef3c7)",
                    border: "1px solid var(--accent-amber, #f59e0b)",
                    borderRadius: "10px",
                    padding: "0.75rem 1rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                    color: "#92400e",
                    flexWrap: "wrap",
                  }}
                >
                  <Star size={18} style={{ color: "#b45309", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 200 }}>
                    Service complete! How was {booking.cook?.name || "your cook"}? Please rate below.
                  </span>
                  {(() => {
                    const reviewWa =
                      booking.reviewWhatsappUrl ||
                      bookingReviewWhatsAppUrl({
                        customerPhone: user?.phone,
                        cookName: booking.cook?.name,
                        booking,
                        reviewUrl:
                          typeof window !== "undefined"
                            ? `${window.location.origin}/bookings/${booking._id}`
                            : undefined,
                      });
                    return reviewWa ? (
                      <a
                        href={reviewWa}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-success btn-sm"
                        title="Get the rating reminder with review link on your WhatsApp"
                      >
                        <MessageCircle size={16} /> Remind me on WhatsApp
                      </a>
                    ) : null;
                  })()}
                </div>
              )}

              {/* Review section for completed bookings */}
              {booking.status === "completed" && (
                <ReviewForm bookingId={booking._id} existingReview={booking.review} onSubmitted={refetch} />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <Calendar size={28} />
          </div>
          <h3>
            {activeFilter === "all"
              ? "No cooking sessions yet"
              : activeFilter === "pending"
                ? "Nothing waiting right now"
                : activeFilter === "active"
                  ? "No upcoming sessions"
                  : activeFilter === "completed"
                    ? "No past meals yet"
                    : "Nothing here"}
          </h3>
          <p style={{ fontSize: "0.95rem", color: "var(--slate-600)", marginBottom: "1rem" }}>
            {activeFilter === "all" ? (
              <>Hungry for home-cooked food? Find a trusted cook near you, pick a date, and send a request — it takes less than a minute.</>
            ) : activeFilter === "pending" ? (
              <>No requests waiting for a cook's reply. When you book, you'll see the wait here.</>
            ) : activeFilter === "active" ? (
              <>No confirmed visits coming up. Book a cook and your plans will show up here.</>
            ) : activeFilter === "completed" ? (
              <>Your enjoyed meals and receipts will appear here after your first session.</>
            ) : (
              <>Nothing in this view. Try another tab, or start a fresh booking.</>
            )}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem", justifyContent: "center" }}>
            <Link to="/cook-on-demand" className="btn btn-primary">
              <Search size={16} /> Book a Cook
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerDashboard;
