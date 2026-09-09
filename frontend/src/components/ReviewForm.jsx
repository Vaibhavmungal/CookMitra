import React, { useState } from "react";
import API from "../api/axios";
import { useToast } from "../context/ToastContext";
import { Star, CheckCircle, MessageSquare } from "lucide-react";

const ReviewForm = ({ bookingId, existingReview, onSubmitted }) => {
  const { showToast } = useToast();
  const [rating, setRating] = useState(existingReview?.rating || undefined);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const done = submitted || !!existingReview;
  const shownRating = submitted ? rating : existingReview?.rating || rating;
  const shownComment = existingReview?.comment || (submitted ? comment : "");

  const ratingLabels = {
    1: "Poor experience",
    2: "Fair",
    3: "Good & tasty",
    4: "Very good experience",
    5: "Outstanding festive cooking!",
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await API.post("/reviews", { booking: bookingId, rating, comment });
      setSubmitted(true);
      showToast("Thank you! Your review has been published.", "success");
      onSubmitted?.();
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to submit review";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "1rem",
          background: "var(--accent-emerald-light)",
          color: "#065f46",
          borderRadius: "var(--radius-md)",
          fontWeight: 600,
          marginTop: "1rem",
          flexWrap: "wrap",
        }}
      >
        <CheckCircle size={18} />
        <span>Thank you for reviewing your cook!</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} size={16} fill={s <= shownRating ? "#f59e0b" : "none"} color={s <= shownRating ? "#f59e0b" : "#94a3b8"} />
          ))}
          <strong style={{ marginLeft: "0.3rem" }}>{shownRating}/5</strong>
        </span>
        {shownComment && (
          <span style={{ width: "100%", fontWeight: 400, fontSize: "0.88rem" }}>“{shownComment}”</span>
        )}
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        marginTop: "1.25rem",
        padding: "1.5rem",
        background: "var(--slate-50)",
        border: "1px solid var(--slate-200)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <MessageSquare size={18} style={{ color: "var(--primary)" }} />
        <h4 style={{ fontSize: "1.05rem", margin: 0 }}>Leave a Cook Review</h4>
      </div>

      {error && (
        <div className="error-alert-banner" style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}>
          {error}
        </div>
      )}

      {/* Interactive Stars */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--slate-700)", marginBottom: "0.4rem" }}>
          Your Rating
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {[1, 2, 3, 4, 5].map((starVal) => {
            const active = (hoverRating || rating || 0) >= starVal;
            return (
              <button
                key={starVal}
                type="button"
                onClick={() => setRating(starVal)}
                onMouseEnter={() => setHoverRating(starVal)}
                onMouseLeave={() => setHoverRating(0)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 2,
                  transition: "transform 0.1s ease",
                }}
              >
                <Star
                  size={26}
                  fill={active ? "#f59e0b" : "none"}
                  color={active ? "#f59e0b" : "#cbd5e1"}
                />
              </button>
            );
          })}
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--slate-600)", marginLeft: "0.5rem" }}>
            {ratingLabels[hoverRating || rating] || "Pick your rating"}
          </span>
        </div>
      </div>

      {/* Comments Area */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--slate-700)", marginBottom: "0.4rem" }}>
          Share Your Experience
        </label>
        <textarea
          rows={3}
          className="form-control"
          placeholder="How was the flavor, cleanliness, timing, and preparation?"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          required
        />
      </div>

      <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
        {loading ? "Submitting..." : "Submit Review"}
      </button>
    </form>
  );
};

export default ReviewForm;
