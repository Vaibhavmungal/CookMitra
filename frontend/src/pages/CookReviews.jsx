import React from "react";
import { Link } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import CookReviewsBlock from "../components/CookReviewsBlock";
import { ArrowLeft, Star } from "lucide-react";

const CookReviews = () => {
  const { data: reviews, loading, error, refetch } = useFetch("/reviews/cook-me");

  return (
    <div className="dashboard-container">
      <div style={{ marginBottom: "1.5rem" }}>
        <Link to="/dashboard/cook-bookings" className="back-link-bar">
          <ArrowLeft size={16} /> Back to Cook Dashboard
        </Link>
      </div>

      <div className="dashboard-header-row">
        <div>
          <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
            <Star size={14} /> Customer Feedback
          </span>
          <h1>All Reviews ({reviews?.length || 0})</h1>
          <p style={{ color: "var(--slate-600)", margin: 0 }}>
            Every rating customers left on your completed services.
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => refetch()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <CookReviewsBlock reviews={reviews} loading={loading} error={error} />
    </div>
  );
};

export default CookReviews;
