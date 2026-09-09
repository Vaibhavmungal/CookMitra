import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  formatCurrency,
  formatDate,
  bookingWhatsAppUrl,
  bookingCustomerWhatsAppUrl,
  cookLiveMapsUrl,
  distanceKm,
  timeAgo,
  osmEmbedUrl,
  sessionEndDate,
  formatRemaining,
  playAlarmSound,
  hoursCompleteWhatsAppUrl,
} from "../utils/constants";
import { getCurrentPositionRobust, formatAccuracy, accuracyGrade } from "../utils/geolocation";
import {
  ArrowLeft,
  MapPin,
  Navigation,
  MessageCircle,
  Phone,
  RefreshCw,
  ChefHat,
  Clock,
  Radio,
  CheckCircle2,
  BellRing,
  LocateFixed,
} from "lucide-react";

const POLL_MS = 15000;

const LiveCookTracking = () => {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [arrivalAnnounced, setArrivalAnnounced] = useState(false);
  const [hoursAnnounced, setHoursAnnounced] = useState(false);
  const [now, setNow] = useState(Date.now());
  const timer = useRef(null);
  // User's own live GPS (optional): lets the customer measure cook distance
  // even when the booking was made without a venue pin.
  const [myLoc, setMyLoc] = useState(null);
  const [locatingMe, setLocatingMe] = useState(false);
  const [locMsg, setLocMsg] = useState("");

  const handleUseMyLocation = async () => {
    setLocatingMe(true);
    setLocMsg("Detecting your location… allow permission if your browser asks. Stay outdoors for best GPS.");
    try {
      const c = await getCurrentPositionRobust();
      setMyLoc(c);
      const grade = accuracyGrade(c.accuracy);
      setLocMsg(
        `Your live location set (${formatAccuracy(c.accuracy)}) — distance is measured from here.` +
        (grade === "poor" ? " Accuracy is poor: re-pin outdoors for a tighter fix." : "")
      );
    } catch (err) {
      setLocMsg(err.message || "Could not detect location.");
    } finally {
      setLocatingMe(false);
    }
  };

  const fetchLive = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await API.get(`/bookings/${bookingId}/live`);
      setData(res.data);
      setLastRefresh(new Date());
      if (res.data?.cookArrived && !arrivalAnnounced) {
        setArrivalAnnounced(true);
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
  }, [bookingId, arrivalAnnounced, hoursAnnounced, showToast]);

  useEffect(() => {
    fetchLive(false);
  }, [fetchLive]);

  // Tick every 30s so the cooking-hours countdown stays fresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    timer.current = setInterval(() => fetchLive(true), POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoRefresh, fetchLive]);

  const cookLoc = data?.effectiveCookLocation || null;
  const venueLoc = data?.venue || null;
  // Distance is measured from the user's live pin when set, else the venue pin.
  const userPos = myLoc || venueLoc;
  const measuringFromLive = myLoc != null;
  const km = distanceKm(cookLoc, userPos);
  const etaMin = km != null ? Math.max(1, Math.round((km / 25) * 60)) : null; // ~25 km/h city avg
  const embed = osmEmbedUrl(cookLoc, userPos || venueLoc);
  const cookMaps = cookLiveMapsUrl(cookLoc);
  const venueMaps =
    venueLoc?.lat != null ? `https://www.google.com/maps?q=${venueLoc.lat},${venueLoc.lng}` : null;
  const dirUrl =
    cookLoc?.lat != null && (userPos?.lat != null || venueLoc?.lat != null)
      ? `https://www.google.com/maps/dir/?api=1&origin=${cookLoc.lat},${cookLoc.lng}&destination=${(userPos || venueLoc).lat},${(userPos || venueLoc).lng}`
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

  const waToSelf = data
    ? bookingCustomerWhatsAppUrl({
        customerPhone: user?.phone,
        cookName: data.cook?.name,
        cookPhone: data.cook?.phone,
        cookLocation: cookLoc,
        booking: {
          _id: data.bookingId,
          serviceType: data.serviceType,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          address: data.address,
          location: venueLoc,
          status: data.status,
        },
      })
    : null;

  const cookUpdatedAt =
    data?.cookLocation?.updatedAt || data?.cookLiveLocation?.updatedAt || null;

  const sessionEnd = data ? sessionEndDate(data) : null;
  const remainingLabel = sessionEnd ? formatRemaining(sessionEnd, now) : null;
  const isActiveSession = data && ["accepted", "confirmed", "in_progress"].includes(data.status);

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

  return (
    <div className="dashboard-container">
      <Link to={user?.role === "cook" ? "/dashboard/cook-bookings" : "/dashboard/my-bookings"} className="back-link-bar" style={{ marginBottom: "1rem" }}>
        <ArrowLeft size={16} /> Back to Bookings
      </Link>

      <div className="dashboard-header-row">
        <div>
          <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
            <Radio size={14} /> Live Tracking
          </span>
          <h1>Track Your Cook</h1>
          <p style={{ color: "var(--slate-600)", margin: 0 }}>
            {data ? (
              <>
                {data.serviceType?.replace(/_/g, " ")} • {formatDate(data.date)} • {data.startTime} - {data.endTime}
                {" • "}Status: <strong>{String(data.status).toUpperCase()}</strong>
              </>
            ) : (
              "Live map of your cook heading to your venue."
            )}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button className="btn btn-outline btn-sm" onClick={() => fetchLive(false)} disabled={loading}>
            <RefreshCw size={15} /> {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            className={`btn btn-sm ${autoRefresh ? "btn-primary" : "btn-outline"}`}
            onClick={() => setAutoRefresh((v) => !v)}
            title="Auto-refresh every 15 seconds"
          >
            {autoRefresh ? "Auto: ON" : "Auto: OFF"}
          </button>
        </div>
      </div>

      {error && <div className="error-alert-banner">{error}</div>}

      {data?.hoursCompleted && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: "12px",
            padding: "0.9rem 1.1rem",
            marginBottom: "1rem",
            fontWeight: 600,
          }}
        >
          <BellRing size={22} style={{ color: "#b45309", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "1rem" }}>Your cooking hours are complete!</div>
            <div style={{ fontSize: "0.82rem", fontWeight: 400, color: "var(--slate-600)" }}>
              Session ended{data.endTime ? ` at ${data.endTime}` : ""}
              {data.hoursCompletedAt ? ` • ${timeAgo(data.hoursCompletedAt)}` : ""} —{" "}
              {user?.role === "cook" ? "please wrap up your session." : "please review your session below."}
            </div>
          </div>
        </div>
      )}

      {data?.cookArrived && (
        <div
          className="success-alert-banner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            background: "var(--accent-emerald-light, #ecfdf5)",
            border: "1px solid var(--accent-emerald, #10b981)",
            borderRadius: "12px",
            padding: "0.9rem 1.1rem",
            marginBottom: "1rem",
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={22} style={{ color: "var(--accent-emerald, #10b981)", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: "1rem" }}>Your cook has reached your location!</div>
            <div style={{ fontSize: "0.82rem", fontWeight: 400, color: "var(--slate-600)" }}>
              {data.cook?.name || "Cook"} arrived
              {data.cookArrivedAt ? ` ${timeAgo(data.cookArrivedAt)}` : ""} — please welcome them.
            </div>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="loading-spinner-wrapper">
          <div className="spinner"></div>
          <p style={{ color: "var(--slate-500)", fontWeight: 600 }}>Loading live location...</p>
        </div>
      ) : data ? (
        <>
          {/* Status strip */}
          <div className="dashboard-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="dashboard-stat-card">
              <div className="stat-icon-wrapper" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
                <ChefHat size={24} />
              </div>
              <div>
                <div className="stat-metric-number" style={{ fontSize: "1.05rem" }}>{data.cook?.name || "Cook"}</div>
                <div className="stat-metric-title">
                  {data.cook?.phone ? <a href={`tel:${data.cook.phone}`}>{data.cook.phone}</a> : "On the way"}
                </div>
              </div>
            </div>
            <div className="dashboard-stat-card">
              <div className="stat-icon-wrapper" style={{ background: "var(--accent-blue-light)", color: "var(--accent-blue)" }}>
                <Navigation size={24} />
              </div>
              <div>
                <div className="stat-metric-number" style={{ fontSize: "1.05rem" }}>
                  {data.cookArrived ? "Arrived ✓" : km != null ? `${km.toFixed(1)} km away` : "Distance unknown"}
                </div>
                <div className="stat-metric-title">{data.cookArrived ? "Cook is at your venue" : etaMin != null ? `~${etaMin} min by road${measuringFromLive ? " (from your live pin)" : " (from venue pin)"}` : "Waiting for cook pin"}</div>
              </div>
            </div>
            <div className="dashboard-stat-card">
              <div className="stat-icon-wrapper" style={{ background: "var(--accent-emerald-light)", color: "var(--accent-emerald)" }}>
                <Clock size={24} />
              </div>
              <div>
                <div className="stat-metric-number" style={{ fontSize: "1.05rem" }}>
                  {cookUpdatedAt ? timeAgo(cookUpdatedAt) : "No pin yet"}
                </div>
                <div className="stat-metric-title">
                  {lastRefresh ? `Map refreshed ${timeAgo(lastRefresh.toISOString())} • auto every 15s` : "Live position"}
                </div>
              </div>
            </div>
            <div className="dashboard-stat-card">
              <div className="stat-icon-wrapper" style={{ background: "var(--accent-amber-light, #fef3c7)", color: "var(--accent-amber, #b45309)" }}>
                <BellRing size={24} />
              </div>
              <div>
                <div className="stat-metric-number" style={{ fontSize: "1.05rem" }}>
                  {data.hoursCompleted ? "Hours complete ✓" : remainingLabel || "Schedule unknown"}
                </div>
                <div className="stat-metric-title">
                  {data.hoursCompleted
                    ? "Alarm sent — please review"
                    : isActiveSession && sessionEnd
                      ? `Ends ${data.endTime} • auto-alarm at end`
                      : "Countdown shows during active session"}
                </div>
              </div>
            </div>
          </div>

          {/* Map */}
          <div className="profile-card-block" style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: 0 }}>
                <MapPin size={18} /> Live Map
              </h3>
              <button
                className="btn btn-outline btn-sm"
                onClick={handleUseMyLocation}
                disabled={locatingMe}
                title="Pin your current GPS so distance is measured from where you are right now"
              >
                <LocateFixed size={15} />
                {locatingMe ? "Locating..." : myLoc ? "Re-pin my location" : "Use my current location"}
              </button>
            </div>
            {locMsg && (
              <div style={{ fontSize: "0.8rem", color: "var(--slate-500)", marginTop: "0.4rem" }}>
                {locMsg}
              </div>
            )}
            {!venueLoc && !myLoc && (
              <div style={{ fontSize: "0.82rem", color: "var(--slate-600)", background: "var(--slate-50)", borderRadius: "8px", padding: "0.6rem 0.9rem", marginTop: "0.6rem" }}>
                No venue pin was saved on this booking — tap "Use my current location" above so we can measure how far the cook is from you.
              </div>
            )}
            {embed ? (
              <iframe
                title="Cook live tracking map"
                src={embed}
                className="track-map-frame"
                loading="lazy"
              />
            ) : (
              <div className="empty-state-card">
                <h3>Waiting for location</h3>
                <p>
                  {data.status === "requested"
                    ? "The cook hasn't accepted yet — tracking starts once they accept and share their live location."
                    : "The cook hasn't shared their live location yet. Ask them to tap “Share Live Location” in their dashboard."}
                </p>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.9rem" }}>
              {dirUrl && (
                <a href={dirUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                  <Navigation size={15} /> Cook Route to Venue
                </a>
              )}
              {cookMaps && (
                <a href={cookMaps} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                  <MapPin size={15} /> Open Cook Pin
                </a>
              )}
              {venueMaps && (
                <a href={venueMaps} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">
                  <MapPin size={15} /> Open Venue Pin
                </a>
              )}
            </div>
          </div>

          {/* Order + contact */}
          <div className="track-grid-2">
            <div className="profile-card-block">
              <h3 style={{ marginTop: 0 }}>Order Details</h3>
              <div style={{ fontSize: "0.9rem", color: "var(--slate-700)", display: "grid", gap: "0.35rem" }}>
                <div><strong>Venue:</strong> {data.address}</div>
                <div><strong>Amount:</strong> {formatCurrency(data.amount)}</div>
                {data.guests && <div><strong>Guests:</strong> {data.guests}</div>}
                {data.selectedItems?.length > 0 && <div><strong>Dishes:</strong> {data.selectedItems.join(", ")}</div>}
                <div style={{ fontSize: "0.8rem", color: "var(--slate-500)" }}>Booking ID: {data.bookingId}</div>
              </div>
            </div>
            <div className="profile-card-block">
              <h3 style={{ marginTop: 0 }}>Contact</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {data.cook?.phone && (
                  <a href={`tel:${data.cook.phone}`} className="btn btn-outline btn-sm">
                    <Phone size={15} /> Call Cook
                  </a>
                )}
                {waToCook && (
                  <a href={waToCook} target="_blank" rel="noreferrer" className="btn btn-success btn-sm">
                    <MessageCircle size={15} /> WhatsApp Cook
                  </a>
                )}
                {waToSelf && (
                  <a href={waToSelf} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                    <MessageCircle size={15} /> Send to My WhatsApp
                  </a>
                )}
                {hoursWaSelf && (
                  <a href={hoursWaSelf} target="_blank" rel="noreferrer" className="btn btn-success btn-sm">
                    <MessageCircle size={15} /> Hours Done on My WhatsApp
                  </a>
                )}
              </div>
              <p style={{ fontSize: "0.78rem", color: "var(--slate-500)", marginBottom: 0 }}>
                Tracking auto-refreshes every 15 seconds. Works best when the cook keeps “Go Live” on.
              </p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default LiveCookTracking;
