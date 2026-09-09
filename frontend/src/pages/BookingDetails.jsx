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
  hoursCompleteWhatsAppUrl,
  cookLiveMapsUrl,
  sessionEndDate,
  formatRemaining,
  timeAgo,
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
          {isActive && user?.role !== "admin" && (
            <button className="btn btn-danger-outline btn-sm" onClick={handleCancel} disabled={cancelling}>
              <XCircle size={16} /> {cancelling ? "Cancelling..." : "Cancel Session"}
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
