import React, { useState, useEffect, useRef } from "react";
import { MapPin, LocateFixed, Search, X, AlertCircle } from "lucide-react";
import { useDispatch } from "react-redux";
import { useSiteLocation } from "../store/hooks";
import {
  requestPreciseLocation,
  setManualLocation,
  clearLocation,
} from "../store/locationSlice";
import { searchLocations } from "../utils/geolocation";

// Header location pill + dropdown. Never blocks the page: GPS denial or a
// failed lookup only shows an inline message while browsing keeps working.
const LocationPicker = ({ onNavigate }) => {
  const { location, status, error, isLocating } = useSiteLocation();
  const dispatch = useDispatch();
  const handlePrecise = () => dispatch(requestPreciseLocation());
  const handleManual = (place) => dispatch(setManualLocation(place));
  const handleClear = () => dispatch(clearLocation());
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);
  const searchSeq = useRef(0);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open ]);

  // Debounced place search while the dropdown is open.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      const hits = await searchLocations(q, 5);
      if (searchSeq.current !== seq) return;
      setResults(hits);
      setSearching(false);
      setSearched(true);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const pillText = isLocating
    ? "Detecting…"
    : location?.label || "Set location";

  const sourceNote =
    location?.source === "gps"
      ? "Precise GPS location"
      : location?.source === "ip"
        ? "Approximate area (IP)"
        : location?.source === "manual"
          ? "Chosen by you"
          : location?.source === "stored"
            ? "Saved location"
            : "";

  const pick = (place) => {
    handleManual(place);
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearched(false);
    if (onNavigate) onNavigate();
  };

  // Enter with no matching result still saves what the user typed.
  const saveTyped = () => {
    const q = query.trim();
    if (!q) return;
    const [cityPart, ...rest] = q.split(",").map((s) => s.trim());
    pick({ label: q, city: cityPart || q, state: rest.join(", ") });
  };

  return (
    <div className="loc-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`loc-pill ${location ? "has-loc" : ""} ${isLocating ? "is-busy" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={location ? `Your location: ${location.label}. Change location` : "Set your location"}
        title={location ? location.label : "Detect or set your location"}
      >
        {isLocating ? (
          <span className="loc-spinner" aria-hidden="true" />
        ) : (
          <MapPin size={15} aria-hidden="true" />
        )}
        <span className="loc-pill-label">{pillText}</span>
        <span className="loc-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="loc-dropdown" role="dialog" aria-label="Choose your location">
          <div className="loc-drop-head">
            <span className="loc-drop-title">Your location</span>
            {location && (
              <button type="button" className="loc-clear" onClick={handleClear}>
                <X size={13} /> Clear
              </button>
            )}
          </div>

          {location && (
            <div className="loc-current">
              <MapPin size={14} aria-hidden="true" />
              <div>
                <div className="loc-current-label">{location.label}</div>
                {sourceNote && <div className="loc-source">{sourceNote}</div>}
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-outline btn-sm loc-gps-btn"
            onClick={handlePrecise}
            disabled={isLocating}
          >
            <LocateFixed size={15} />
            {isLocating ? "Detecting…" : location ? "Re-detect my location" : "Use my current location"}
          </button>

          {error && (
            <p className="loc-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" /> {error}
            </p>
          )}

          <div className="loc-search-row">
            <Search size={15} className="loc-search-icon" aria-hidden="true" />
            <input
              type="text"
              className="form-control loc-search-input"
              placeholder="Search area or city — e.g. Kothrud, Pune"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (results.length > 0) pick(results[0]);
                  else saveTyped();
                }
              }}
              aria-label="Search for your area or city"
            />
          </div>

          {searching && <p className="loc-hint">Searching…</p>}

          {!searching && results.length > 0 && (
            <ul className="loc-results">
              {results.map((r, i) => (
                <li key={`${r.lat}-${r.lng}-${i}`}>
                  <button type="button" onClick={() => pick(r)}>
                    <MapPin size={14} aria-hidden="true" />
                    <span>{r.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {!searching && searched && results.length === 0 && (
            <div className="loc-nohit">
              <p className="loc-hint">No matches found.</p>
              <button type="button" className="btn btn-outline btn-sm" onClick={saveTyped}>
                Use “{query.trim()}” anyway
              </button>
            </div>
          )}

          <p className="loc-footnote">
            {status === "denied"
              ? "GPS is blocked — manual search works fully, nothing on the site is blocked."
              : "Denying GPS never blocks browsing — you can always search manually."}
          </p>
        </div>
      )}
    </div>
  );
};

export default LocationPicker;
