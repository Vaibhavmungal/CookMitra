import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API from "../api/axios";
import { useSelector } from "react-redux";
import { useShowToast } from "../store/hooks";
import {
  formatDate,
  bookingWhatsAppUrl,
  cookLiveMapsUrl,
  distanceKm,
  timeAgo,
  osmEmbedUrl,
  sessionEndDate,
  effectiveServiceWindow,
  formatRemaining,
  playAlarmSound,
  hoursCompleteWhatsAppUrl,
} from "../utils/constants";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  MessageCircle,
  Phone,
  Clock,
  Calendar,
  CheckCircle2,
  BellRing,
} from "lucide-react";

const POLL_MS = 15000;

const LiveCookTracking = () => {
  const { bookingId } = useParams();
  const user = useSelector((s) => s.auth.user);
  const showToast = useShowToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [arrivalAnnounced, setArrivalAnnounced] = useState(false);
  const [hoursAnnounced, setHoursAnnounced] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);

  const fetchLive = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await API.get(`/bookings/${bookingId}/live`);
      setData(res.data);
      if (res.data?.cookArrived && !arrivalAnnounced) {
        setArrivalAnnounced(true);
        // Customer-facing notice — never toast/ping the cook with
        // "Your cook has reached your location!".
        if (user?.role !== "cook") {
          showToast(`Your cook ${res.data.cook?.name || ""} has reached your location!`, "success", 6000);
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("Cook has arrived!", {
                body: `${res.data.cook?.name || "Your cook"} has reached your location.`,
              });
            }
          } catch {
            // browser notifications optional; toast + banner are the guarantee
          }
        }
      }
      if (res.data?.hoursCompleted && !hoursAnnounced) {
        setHoursAnnounced(true);
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
    } catch (err) {
      setError(err.response?.data?.message || "Could not load live tracking");
    } finally {
      setLoading(false);
    }
  }, [bookingId, arrivalAnnounced, hoursAnnounced, showToast, user?.role]);

  useEffect(() => {
    fetchLive(false);
  }, [fetchLive]);

  // Tick every 30s so the cooking-hours countdown stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Silent auto-refresh (always on — no toggles, no manual refresh button).
  useEffect(() => {
    timer.current = setInterval(() => fetchLive(true), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [fetchLive]);

  const cookLoc = data?.effectiveCookLocation || null;
  const venueLoc = data?.venue || null;
  const km = distanceKm(cookLoc, venueLoc);
  const etaMin = km != null ? Math.max(1, Math.round((km / 25) * 60)) : null; // ~25 km/h city avg
  const embed = osmEmbedUrl(cookLoc, venueLoc);
  const dirUrl =
    cookLoc?.lat != null && venueLoc?.lat != null
      ? `https://www.google.com/maps/dir/?api=1&origin=${cookLoc.lat},${cookLoc.lng}&destination=${venueLoc.lat},${venueLoc.lng}`
      : null;

  const waToCook = data
    ? bookingWhatsAppUrl({
        cookPhone: data.cook?.phone,
        customerName: user?.name,
        customerPhone: user?.phone,
        booking: {
          _id: data.bookingId,
          serviceType: data.serviceType,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          address: data.address,
          location: venueLoc,
          guests: data.guests,
          selectedItems: data.selectedItems,
        },
      })
    : null;

  const cookUpdatedAt =
    data?.cookLocation?.updatedAt || data?.cookLiveLocation?.updatedAt || null;

  const sessionEnd = data ? sessionEndDate(data) : null;
  const remainingLabel = sessionEnd ? formatRemaining(sessionEnd, now) : null;
  // Redefined window: actual start → actual end once service has started.
  // Same helpers as the booking details page so both screens count down
  // the identical live clock (serviceEndsAt preferred over the slot).
  const serviceWindow = data ? effectiveServiceWindow(data) : { startTime: null, endTime: null };
  const isActiveSession = data && ["accepted", "confirmed", "in_progress"].includes(data.status);
  // Details page also counts down while still "requested" — mirror it.
  const isActive = data && ["requested", "accepted", "confirmed", "in_progress"].includes(data.status);
  const startedAtLabel = data?.serviceStartedAt
    ? new Date(data.serviceStartedAt).toLocaleString("en-IN", {
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      })
    : "";

  // Hours-complete alarm on the viewer's own WhatsApp (works for both roles).
  const hoursWaSelf = data?.hoursCompleted
    ? data.hoursCompleteCustomerUrl && user?.role !== "cook"
      ? data.hoursCompleteCustomerUrl
      : data.hoursCompleteCookUrl && user?.role === "cook"
        ? data.hoursCompleteCookUrl
        : hoursCompleteWhatsAppUrl({
            toPhone: user?.phone,
            booking: {
              _id: data.bookingId,
              serviceType: data.serviceType,
              date: data.date,
              endTime: data.endTime,
              address: data.address,
              hoursCompletedAt: data.hoursCompletedAt,
            },
            cookName: data.cook?.name,
            cookPhone: data.cook?.phone,
            customerName: user?.role === "cook" ? data.customer?.name : user?.name,
          })
    : null;

  const isCookView = user?.role === "cook";
  const heroTitle = isCookView
    ? "Heading to the venue"
    : data?.cook?.name || "Track Your Cook";

  if (loading && !data) {
    return (
      <div className="bd-loading">
        <div className="loading-spinner-wrapper">
          <div className="spinner"></div>
          <p className="bd-mini-note">Loading live location...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bd-wrap">
      <div className="bd-back">
        <Link to={isCookView ? "/dashboard/cook-bookings" : "/dashboard/my-bookings"} className="back-link-bar">
          <ArrowLeft size={16} /> Back to Bookings
        </Link>
      </div>

      {/* Hero */}
      <div className="bd-hero">
        <div className="bd-hero-top">
          <span className="bd-eyebrow">
            <span className="lt-live-dot" aria-hidden="true" /> Live tracking
          </span>
          {data && (
            <span className="badge badge-slate">{String(data.status).replace(/_/g, " ").toUpperCase()}</span>
          )}
        </div>
        <h1 className="bd-title">{heroTitle}</h1>
        <p className="bd-sub">
          {data ? (
            <>
              {data.serviceType?.replace(/_/g, " ")} • {formatDate(data.date)} • {serviceWindow.startTime} – {serviceWindow.endTime}
            </>
          ) : (
            "Live map of your cook heading to your venue."
          )}
        </p>
        {data && (
          data.cookArrived && !isCookView ? (
            <div className="lt-hero-distance">
              <strong>Arrived ✓</strong>
              <span>Cook is at your venue</span>
            </div>
          ) : km != null ? (
            <div className="lt-hero-distance">
              <strong>{km.toFixed(1)} km</strong>
              <span>away{etaMin != null ? ` • ~${etaMin} min by road` : ""}</span>
            </div>
          ) : null
        )}
        {data && !data.hoursCompleted && isActive && remainingLabel && (
          <div className="bd-hero-facts">
            <span className="bd-fact-chip live"><Clock size={13} /> Cooking time: {remainingLabel}</span>
          </div>
        )}
      </div>

      {/* Service-started banner — worded exactly like the booking details
          page so both screens read the same live clock. */}
      {data?.serviceStartedAt && isActiveSession && (
        <div className="bd-banner ok">
          <CheckCircle2 size={18} />
          <span>
            Service started {startedAtLabel}
            {sessionEnd ? ` • ends ${serviceWindow.endTime || ""} (${remainingLabel})` : ""} — hours are being counted.
          </span>
        </div>
      )}

      {error && <div className="error-alert-banner">{error}</div>}

      {data?.hoursCompleted && (
        <div className="bd-banner warn">
          <BellRing size={18} />
          <span>
            Your cooking hours are complete! Session ended
            {serviceWindow.endTime ? ` at ${serviceWindow.endTime}` : ""}
            {data.hoursCompletedAt ? ` • ${timeAgo(data.hoursCompletedAt)}` : ""} —{" "}
            {isCookView ? "please wrap up your session." : "please review your session."}
          </span>
        </div>
      )}

      {data?.cookArrived && !isCookView && (
        <div className="bd-banner ok">
          <CheckCircle2 size={22} />
          <span>
            Your cook has reached your location! {data.cook?.name || "Cook"} arrived
            {data.cookArrivedAt ? ` ${timeAgo(data.cookArrivedAt)}` : ""} — please welcome them.
          </span>
        </div>
      )}

      {data && (
        <div className="bd-card">
          <div className="lt-map-head">
            <h3 className="bd-card-head">
              <MapPin size={18} /> Live Map
            </h3>
            <span className="lt-map-refresh">
              {cookUpdatedAt ? `Cook pin ${timeAgo(cookUpdatedAt)}` : "Waiting for cook pin"}
            </span>
          </div>
          {embed ? (
            <iframe
              title="Cook live tracking map"
              src={embed}
              className="lt-map-frame"
              loading="lazy"
            />
          ) : (
            <div className="lt-waiting">
              <div className="lt-waiting-icon">
                <MapPin size={26} />
              </div>
              <h3>Waiting for location</h3>
              <p>
                {data.status === "requested"
                  ? "The cook hasn't accepted yet — tracking starts once they accept and share their live location."
                  : "The cook hasn't shared their live location yet. Ask them to tap “Share Live Location” in their dashboard."}
              </p>
            </div>
          )}
          <div className="lt-map-actions">
            {dirUrl && (
              <a href={dirUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                <Navigation size={15} /> Cook Route to Venue
              </a>
            )}
            {(isCookView ? data.customer?.phone : data.cook?.phone) && (
              <a href={`tel:${isCookView ? data.customer.phone : data.cook.phone}`} className="btn btn-outline btn-sm">
                <Phone size={15} /> Call {isCookView ? "Customer" : "Cook"}
              </a>
            )}
            {waToCook && !isCookView && (
              <a href={waToCook} target="_blank" rel="noreferrer" className="btn btn-success btn-sm">
                <MessageCircle size={15} /> WhatsApp Cook
              </a>
            )}
            {hoursWaSelf && (
              <a href={hoursWaSelf} target="_blank" rel="noreferrer" className="btn btn-success btn-sm">
                <MessageCircle size={15} /> Hours Done on WhatsApp
              </a>
            )}
          </div>
          <div className="lt-booking-strip">
            <MapPin size={15} />
            <span>{data.address || "Venue address on the booking"}</span>
            <Link to={`/bookings/${data.bookingId}`} className="cook-link-btn">
              Booking details →
            </Link>
          </div>
        </div>
      )}

      {data && (
        <div className="bd-actionbar">
          <span className="bd-actionbar-hint">
            <Calendar size={12} />{" "}
            {data.serviceType?.replace(/_/g, " ")} • {formatDate(data.date)} • {serviceWindow.startTime} – {serviceWindow.endTime}
          </span>
          <Link to={`/bookings/${data.bookingId}`} className="btn btn-outline btn-sm">
            Booking details
          </Link>
          {dirUrl && (
            <a href={dirUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
              <Navigation size={15} /> Navigate
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveCookTracking;
