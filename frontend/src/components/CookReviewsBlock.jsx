import React, { useEffect } from "react";
import { useShowToast } from "../store/hooks";
import { formatDate } from "../utils/constants";
import { Star, User } from "lucide-react";

// Reviews received from customers — star rating + words.
// Shared by the all-reviews page (full list).
const CookReviewsBlock = ({ reviews, loading, error }) => {
  const showToast = useShowToast();
  const list = reviews || [];
  const avg =
    list.length > 0
      ? (list.reduce((sum, r) => sum + Number(r.rating || 0), 0) / list.length).toFixed(1)
      : null;

  useEffect(() => {
    if (error) {
      showToast(error, "error", 6000);
    }
  }, [error, showToast]);

  if (loading) {
    return (
      <div className="loading-spinner-wrapper">
        <div className="spinner"></div>
        <p style={{ color: "var(--slate-500)", fontWeight: 600 }}>Loading your reviews...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div className="profile-card-block" style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div
            className="stat-icon-wrapper"
            style={{ background: "var(--accent-amber-light)", color: "var(--accent-amber)", width: 60, height: 60 }}
          >
            <Star size={28} />
          </div>
          <div>
            <div className="stat-metric-number" style={{ fontSize: "1.75rem" }}>
              {avg ? `${avg}/5` : "No ratings yet"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", margin: "0.15rem 0" }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={16}
                  fill={avg && s <= Math.round(Number(avg)) ? "#f59e0b" : "none"}
                  color={avg && s <= Math.round(Number(avg)) ? "#f59e0b" : "#cbd5e1"}
                />
              ))}
            </div>
            <div className="stat-metric-title">
              Based on {list.length} customer review{list.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      </div>

      {/* Review cards */}
      {list.length > 0 ? (
        <div className="bookings-list-modern">
          {list.map((rev) => (
            <div key={rev._id} className="booking-item-card">
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                <div className="cook-customer-avatar">
                  {rev.customer?.name ? rev.customer.name[0].toUpperCase() : <User size={22} />}
                </div>
                <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                  <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{rev.customer?.name || "Verified Customer"}</h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--slate-500)" }}>
                    {rev.createdAt ? formatDate(rev.createdAt) : ""}
                    {rev.booking?.serviceType ? ` • ${rev.booking.serviceType.replace(/_/g, " ")}` : ""}
                  </span>
                </div>
                <span className="badge badge-amber">
                  <Star size={13} /> {rev.rating}/5
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.2rem", marginBottom: "0.5rem" }}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={16}
                    fill={s <= rev.rating ? "#f59e0b" : "none"}
                    color={s <= rev.rating ? "#f59e0b" : "#cbd5e1"}
                  />
                ))}
              </div>
              {rev.comment ? (
                <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--slate-700)", fontStyle: "italic" }}>
                  "{rev.comment}"
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--slate-400)" }}>
                  Rated {rev.rating}/5 with no written feedback.
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <Star size={28} />
          </div>
          <h3>No Reviews Yet</h3>
          <p>
            Once customers rate your completed services, their star rating and words will appear
            here — and on your public cook profile.
          </p>
        </div>
      )}
    </div>
  );
};

export default CookReviewsBlock;
