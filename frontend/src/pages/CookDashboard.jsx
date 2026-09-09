import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import API from "../api/axios";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { formatCurrency, formatDate } from "../utils/constants";
import CookProfileForm from "../components/CookProfileForm";
import CookAvailabilityToggle from "../components/CookAvailabilityToggle";

const CookDashboard = () => {
  const { data: bookings, loading: loadingBookings, error: bookingError, refetch: refetchBookings } = useFetch("/bookings/cook");
  const { data: cookProfile, loading: loadingProfile, refetch: refetchCookProfile } = useFetch("/cooks/me");
  const { data: myReviews, loading: loadingReviews } = useFetch("/reviews/cook-me");
  const { showToast } = useToast();
  const { user } = useAuth();
  const [view, setView] = useState("needs-action");

  const handleAction = async (bookingId, action) => {
    try {
      await API.patch(`/bookings/${bookingId}/${action}`);
      showToast(
        action === "accept" ? "Booking accepted" : action === "reject" ? "Booking declined" : `Booking ${action}d`,
        action === "reject" ? "info" : "success"
      );
      refetchBookings();
    } catch (err) {
      showToast(err.response?.data?.message || `Failed to ${action} booking`, "error");
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case "requested":
        return <span className="badge badge-amber">Action Needed</span>;
      case "accepted":
      case "confirmed":
        return <span className="badge badge-blue">Scheduled</span>;
      case "completed":
        return <span className="badge badge-emerald">Completed</span>;
      case "rejected":
        return <span className="badge badge-rose">Declined</span>;
      case "cancelled":
        return <span className="badge badge-slate">Cancelled</span>;
      default:
        return <span className="badge badge-slate">{status}</span>;
    }
  };

  // Counts for the greeting + tabs. Per-booking payment badges show earnings
  // where they matter (on each card).
  const pendingRequests = bookings?.filter((b) => b.status === "requested")?.length || 0;

  // Views: needs-action (new requests) vs upcoming (all live) vs previous.
  const isPrevious = (b) => ["completed", "cancelled", "rejected"].includes(b.status);
  // Actionable first: new requests on top, then scheduled, then by date.
  const statusRank = (s) =>
    ({ requested: 0, accepted: 1, confirmed: 1, in_progress: 2 }[s] ?? 3);
  const visibleBookings = [...(bookings || [])]
    .filter((b) => {
      if (view === "needs-action") return b.status === "requested";
      if (view === "upcoming") return !isPrevious(b);
      if (view === "previous") return isPrevious(b);
      return true;
    })
    .sort((a, b) => {
      if (view === "previous") return new Date(b.date) - new Date(a.date);
      return statusRank(a.status) - statusRank(b.status) || new Date(a.date) - new Date(b.date);
    });
  const previousCount = (bookings || []).filter(isPrevious).length;
  const upcomingCount = (bookings || []).length - previousCount;

  return (
    <div className="dashboard-container cook-modern">
      {/* Simple header */}
      <div className="profile-card-block" style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Hello, {user?.name?.split(" ")[0] || "Chef"}</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--slate-500)", fontSize: "0.9rem" }}>
            {pendingRequests > 0 ? `${pendingRequests} new request${pendingRequests === 1 ? "" : "s"} waiting` : "You're all caught up"}
          </p>
        </div>
        <CookAvailabilityToggle
          availabilityStatus={cookProfile?.availabilityStatus}
          onChanged={() => refetchCookProfile()}
        />
      </div>

      {!loadingProfile && (!cookProfile || cookProfile.approvalStatus !== "approved") && (
        <div className="profile-card-block" style={{ marginBottom: "1.25rem" }}>
          <p style={{ margin: 0, fontSize: "0.9rem" }}>
            {!cookProfile
              ? "Create your profile to start receiving bookings."
              : cookProfile.approvalStatus === "rejected"
              ? "Your application needs attention — please update your profile."
              : "Your profile is under review."}{" "}
            <button
              onClick={() => setView("profile")}
              style={{ background: "none", border: "none", color: "var(--primary)", fontWeight: 700, cursor: "pointer", padding: 0 }}
            >
              {cookProfile ? "Review profile" : "Create profile"} →
            </button>
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-navigation-bar cook-modern-tabs" style={{ marginBottom: "1.25rem" }}>
        <button
          className={`tab-btn ${view === "needs-action" ? "active" : ""}`}
          onClick={() => setView("needs-action")}
        >
          New ({pendingRequests})
        </button>
        <button
          className={`tab-btn ${view === "upcoming" ? "active" : ""}`}
          onClick={() => setView("upcoming")}
        >
          Upcoming ({upcomingCount})
        </button>
        <button
          className={`tab-btn ${view === "previous" ? "active" : ""}`}
          onClick={() => setView("previous")}
        >
          Past ({previousCount})
        </button>
        <button
          className={`tab-btn ${view === "profile" ? "active" : ""}`}
          onClick={() => setView("profile")}
        >
          Profile
        </button>
      </div>

      {/* BOOKINGS VIEWS */}
      {view !== "profile" && (
        <div>

          {loadingBookings && <p style={{ color: "var(--slate-500)" }}>Loading bookings...</p>}

          {bookingError && <p style={{ color: "#dc2626" }}>{bookingError}</p>}

          {!loadingBookings && bookings && bookings.length > 0 ? (
            visibleBookings.length > 0 ? (
            <div className="bookings-list-modern">
              {visibleBookings.map((booking) => (
                <div key={booking._id} className="booking-item-card">
                  <div className="booking-item-top">
                    <div>
                      <h3 style={{ margin: 0 }}>{booking.customer?.name || "Client"}</h3>
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.88rem", color: "var(--slate-600)" }}>
                        {formatDate(booking.date)} · {booking.startTime} - {booking.endTime}
                      </p>
                      {booking.address && (
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.85rem", color: "var(--slate-500)" }}>
                          {booking.address}
                        </p>
                      )}
                    </div>
                    <div>{getStatusLabel(booking.status)}</div>
                  </div>

                  <p style={{ margin: "0 0 0.75rem", fontWeight: 700 }}>
                    {booking.payment?.status === "paid"
                      ? formatCurrency(booking.payment.paidAmount || booking.amount || 0)
                      : `${formatCurrency(booking.amount || 0)} (unpaid)`}
                  </p>

                  {booking.notes && (
                    <p style={{ fontSize: "0.88rem", color: "var(--slate-600)", margin: "0 0 0.75rem" }}>
                      Note: {booking.notes}
                    </p>
                  )}

                  {booking.status === "requested" && (
                    <div className="booking-actions-row">
                      <button className="btn btn-success" onClick={() => handleAction(booking._id, "accept")}>
                        <Check size={16} /> Accept
                      </button>
                      <button className="btn btn-danger-outline" onClick={() => handleAction(booking._id, "reject")}>
                        <X size={16} /> Decline
                      </button>
                    </div>
                  )}

                  {["accepted", "confirmed", "in_progress"].includes(booking.status) && (
                    <div className="booking-actions-row">
                      <button className="btn btn-primary" onClick={() => handleAction(booking._id, "complete")}>
                        <Check size={16} /> Mark Completed
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            ) : (
              <div className="empty-state-card">
                <h3>No bookings here</h3>
                <p>New requests will appear here.</p>
              </div>
            )
          ) : (
            !loadingBookings && (
              <div className="empty-state-card">
                <h3>No bookings yet</h3>
                <p>Stay marked Available so customers can book you.</p>
              </div>
            )
          )}
        </div>
      )}

      {/* PROFILE TAB: cook profile + recent reviews */}
      {view === "profile" && (
        <div>
          <CookProfileManager onSaved={() => refetchCookProfile()} />
          <RecentReviewsPreview reviews={myReviews} loading={loadingReviews} />
        </div>
      )}
    </div>
  );
};

const RecentReviewsPreview = ({ reviews, loading }) => {
  const list = (reviews || []).slice(0, 3);
  const total = (reviews || []).length;
  if (loading) return <p style={{ color: "var(--slate-500)" }}>Loading reviews...</p>;
  if (!list.length) return null;
  return (
    <div className="profile-card-block" style={{ marginTop: "1.25rem" }}>
      <h3 style={{ margin: "0 0 0.75rem" }}>Reviews ({total})</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {list.map((rev) => (
          <p key={rev._id} style={{ margin: 0, fontSize: "0.9rem" }}>
            <strong>★ {rev.rating}</strong> — {rev.customer?.name || "Customer"}
            {rev.comment ? ` — "${rev.comment}"` : ""}
          </p>
        ))}
        {total > 3 && (
          <Link to="/dashboard/cook-reviews" style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--primary)" }}>
            See all reviews →
          </Link>
        )}
      </div>
    </div>
  );
};

// Profile tab reuses the shared cook profile form (same as the Cook Setup
// page) so the two can never diverge again.
const CookProfileManager = ({ onSaved }) => {
  return (
    <div style={{ maxWidth: 700 }}>
      <CookProfileForm
        createTitle="Create Your Cook Profile"
        manageTitle="Edit Your Cook Profile"
        onSaved={onSaved}
      />
    </div>
  );
};

export default CookDashboard;
