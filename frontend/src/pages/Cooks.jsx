import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { formatCurrency, localTomorrowStr } from "../utils/constants";
import { resolveFileUrl } from "../components/CookDocUploads";
import {
  Search,
  MapPin,
  Star,
  ChefHat,
  CheckCircle,
  Filter,
  ArrowRight,
  Sparkles,
  RotateCcw,
  CalendarCheck,
  Clock3,
} from "lucide-react";

const Cooks = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState({
    serviceType: searchParams.get("serviceType") || "",
    serviceArea: searchParams.get("serviceArea") || "",
    search: searchParams.get("search") || "",
    date: searchParams.get("date") || "",
    durationHours: searchParams.get("durationHours") || "",
  });

  const params = new URLSearchParams();
  if (filters.serviceType) params.append("serviceType", filters.serviceType);
  if (filters.serviceArea) params.append("serviceArea", filters.serviceArea);
  if (filters.search) params.append("search", filters.search);
  // Availability scope: booked-out cooks are hidden from results.
  if (filters.date) params.append("date", filters.date);
  if (filters.date && filters.durationHours) params.append("durationHours", filters.durationHours);

  const { data: cooks, loading, error } = useFetch(`/cooks?${params.toString()}`);

  const handleChange = (e) => {
    const updated = { ...filters, [e.target.name]: e.target.value };
    setFilters(updated);
  };

  const handleReset = () => {
    setFilters({ serviceType: "", serviceArea: "", search: "", date: "", durationHours: "" });
  };

  const availabilityActive = Boolean(filters.date);

  return (
    <div className="cooks-page-container">
      {/* Page Header */}
      <div className="page-header-banner">
        <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
          <Sparkles size={14} /> Expert Culinary Talent
        </span>
        <h1>Find Verified Festive Cooks</h1>
        <p>
          Browse experienced cooks and chefs specializing in traditional festive faral, authentic sweets, and festive feasts.
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="cooks-filter-bar">
        <div className="input-with-icon">
          <Search size={18} className="input-icon-prefix" />
          <input
            type="text"
            name="search"
            className="form-control"
            placeholder="Search by cook name or dish (e.g. Modak)..."
            value={filters.search}
            onChange={handleChange}
          />
        </div>

        <div className="input-with-icon">
          <ChefHat size={18} className="input-icon-prefix" />
          <select
            name="serviceType"
            className="form-control"
            value={filters.serviceType}
            onChange={handleChange}
          >
            <option value="">All Services</option>
            <option value="cook_for_me">Cook for Me</option>
            <option value="cook_with_me">Cook With Me</option>
            <option value="teach_me">Teach Me</option>
            <option value="preparation_help">Preparation Help</option>
          </select>
        </div>

        <div className="input-with-icon">
          <MapPin size={18} className="input-icon-prefix" />
          <input
            type="text"
            name="serviceArea"
            className="form-control"
            placeholder="Location (e.g. Pune)..."
            value={filters.serviceArea}
            onChange={handleChange}
          />
        </div>

        <div className="input-with-icon">
          <CalendarCheck size={18} className="input-icon-prefix" />
          <input
            type="date"
            name="date"
            className="form-control"
            value={filters.date}
            min={localTomorrowStr()}
            onChange={handleChange}
            title="Show only cooks free on this date"
          />
        </div>

        <div className="input-with-icon">
          <Clock3 size={18} className="input-icon-prefix" />
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.]?[0-9]*"
            name="durationHours"
            className="form-control"
            placeholder="Hours (e.g. 3)"
            value={filters.durationHours}
            min={1}
            max={12}
            step={0.5}
            onChange={handleChange}
            title="Session length — hides cooks with no fitting start time"
          />
        </div>

        <div>
          <button
            onClick={handleReset}
            className="btn btn-outline"
            style={{ width: "100%", padding: "0.7rem 1.1rem" }}
            title="Reset filters"
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>
      </div>

      {/* Results Meta Info */}
      <div className="results-meta-bar">
        <span className="results-count">
          {cooks
            ? `Showing ${cooks.length} available cook${cooks.length === 1 ? "" : "s"}${
                availabilityActive ? ` for ${filters.date}${filters.durationHours ? ` • ${filters.durationHours}h` : ""}` : ""
              }`
            : "Loading cooks..."}
        </span>
      </div>
      {availabilityActive && (
        <p className="field-hint" style={{ marginTop: "-1rem", marginBottom: "1.5rem" }}>
          <CheckCircle size={13} /> Fully booked cooks are hidden from these results.
        </p>
      )}

      {loading && (
        <div className="loading-spinner-wrapper">
          <div className="spinner"></div>
          <p style={{ color: "var(--slate-500)", fontWeight: 600 }}>Searching expert cooks...</p>
        </div>
      )}

      {error && (
        <div className="error-alert-banner">
          <span>Failed to load cooks: {error}</span>
        </div>
      )}

      {/* Cooks Grid */}
      {!loading && cooks && cooks.length > 0 && (
        <div className="cooks-grid-modern">
          {cooks.map((cook) => {
            const avgRating = cook.rating?.average || 5.0;
            const reviewCount = cook.rating?.count || 0;
            return (
              <div key={cook._id} className="cook-card-modern">
                <div>
                  <div className="cook-card-header">
                    <div className="cook-avatar-badge">
                      <div className="cook-avatar-img">
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
                      <div className="verified-dot" title="Identity Verified">
                        ✓
                      </div>
                    </div>

                    <div className="cook-meta-info">
                      <h3>{cook.user?.name}</h3>
                      <div className="cook-location-row">
                        <MapPin size={14} />
                        <span>{cook.serviceArea || "Pune & Surrounds"}</span>
                        <span>•</span>
                        <span>{cook.experienceYears || 5}+ yrs exp</span>
                      </div>

                      <div className="cook-rating-line">
                        <div className="star-rating-display">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={14}
                              fill={i < Math.round(avgRating) ? "#f59e0b" : "none"}
                              color={i < Math.round(avgRating) ? "#f59e0b" : "#cbd5e1"}
                            />
                          ))}
                        </div>
                        <span>{avgRating.toFixed(1)}</span>
                        <span className="rating-count-label">({reviewCount})</span>
                      </div>
                    </div>
                  </div>

                  <p className="cook-bio-preview">
                    {cook.bio || "Passionate about traditional authentic cooking, homemade sweets, and joyful family festival celebrations."}
                  </p>

                  <div className="cook-specialties-wrap">
                    {cook.specialties?.slice(0, 4).map((s, i) => (
                      <span key={i} className="badge badge-festive">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="cook-card-bottom">
                  <div className="cook-rate-display">
                    <span className="rate-amount">{formatCurrency(cook.rate)}</span>
                    <span className="rate-unit">per hour session</span>
                  </div>

                  <Link to={`/cooks/${cook._id}`} className="btn btn-primary btn-sm">
                    <span>View Profile & Book</span>
                    <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && cooks && cooks.length === 0 && (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <Filter size={28} />
          </div>
          <h3>No Cooks Match Your Criteria</h3>
          <p>Try adjusting your search terms, removing filters, or searching in nearby areas.</p>
          <button onClick={handleReset} className="btn btn-primary">
            Clear All Filters
          </button>
        </div>
      )}
    </div>
  );
};

export default Cooks;
