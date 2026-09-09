import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  getCurrentPositionRobust,
  reverseGeocode,
  formatLocationLabel,
  fetchIpLocation,
} from "../utils/geolocation";

const LocationContext = createContext(null);

const STORAGE_KEY = "cm-user-location-v1";
const AUTO_ASK_KEY = "cm-loc-auto-asked";

const loadStored = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.label) return null;
    return { ...parsed, source: parsed.source || "stored" };
  } catch {
    return null;
  }
};

const persist = (loc) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loc, savedAt: Date.now() }));
  } catch {
    // storage unavailable (private mode) — location still works for this visit
  }
};

export const LocationProvider = ({ children }) => {
  const [location, setLocation] = useState(null);
  // idle: nothing yet | locating: GPS/IP in flight | ready: we have a place
  // denied: browser permission blocked | error: GPS failed for another reason
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const autoAsked = useRef(false);

  // Precise browser-GPS detection + reverse-geocode into "Area, City".
  // Only call from a user gesture or the one first-visit auto-attempt —
  // never in a loop — so the permission prompt appears at most when needed.
  const requestPreciseLocation = useCallback(async () => {
    setStatus("locating");
    setError("");
    try {
      const c = await getCurrentPositionRobust();
      const geo = await reverseGeocode(c.lat, c.lng);
      const area = geo.area || geo.suburb || geo.street || "";
      const label =
        formatLocationLabel({ area, city: geo.city, state: geo.state }) || "Current location";
      const next = {
        label,
        city: geo.city || "",
        area,
        state: geo.state || "",
        lat: c.lat,
        lng: c.lng,
        accuracy: c.accuracy ?? null,
        timestamp: c.timestamp || Date.now(),
        source: "gps",
      };
      setLocation(next);
      persist(next);
      setStatus("ready");
      return next;
    } catch (err) {
      const msg = err?.message || "Could not detect your location";
      const denied =
        err?.code === 1 || /permission|blocked|denied|secure page/i.test(msg);
      // Permission denial is not a failure of the site — fall back to an
      // approximate IP city (no permission needed) so the header still shows
      // something useful, and keep the manual search always available.
      if (denied) {
        try {
          const ip = await fetchIpLocation();
          if (ip?.label) {
            const approx = {
              label: ip.label,
              city: ip.city || "",
              area: "",
              state: ip.state || "",
              lat: null,
              lng: null,
              source: "ip",
            };
            setLocation(approx);
            persist(approx);
            setStatus("ready");
            setError("Precise location is off — showing approximate area. Enable GPS for better accuracy.");
            return approx;
          }
        } catch {
          // ignore — fall through to the denied state below
        }
        setStatus("denied");
        setError("Location permission denied — search your area below. The site works fine without it.");
      } else {
        setStatus("error");
        setError(msg || "Location lookup failed — search your area below.");
      }
      return null;
    }
  }, []);

  const setManualLocation = useCallback((place) => {
    if (!place) return null;
    const label =
      place.label || formatLocationLabel(place) || "Selected location";
    const next = {
      label,
      city: place.city || "",
      area: place.area || "",
      state: place.state || "",
      lat: Number.isFinite(place.lat) ? place.lat : null,
      lng: Number.isFinite(place.lng) ? place.lng : null,
      source: place.source || "manual",
    };
    setLocation(next);
    persist(next);
    setStatus("ready");
    setError("");
    return next;
  }, []);

  const clearLocation = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setLocation(null);
    setStatus("idle");
    setError("");
  }, []);

  // First visit: reuse the stored place when available (no permission prompt
  // at all). Otherwise make one automatic GPS attempt per browser session so
  // opening the site detects the city, then never auto-prompt again — further
  // attempts only happen when the user taps the location pill.
  useEffect(() => {
    if (autoAsked.current) return;
    autoAsked.current = true;
    const stored = loadStored();
    if (stored) {
      setLocation(stored);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    try {
      if (sessionStorage.getItem(AUTO_ASK_KEY)) return;
      sessionStorage.setItem(AUTO_ASK_KEY, "1");
    } catch {
      // storage unavailable — still attempt once per mount
    }
    (async () => {
      if (cancelled) return;
      await requestPreciseLocation();
    })();
    return () => {
      cancelled = true;
    };
  }, [requestPreciseLocation]);

  return (
    <LocationContext.Provider
      value={{
        location,
        status,
        error,
        isLocating: status === "locating",
        requestPreciseLocation,
        setManualLocation,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used within a LocationProvider");
  return ctx;
};
