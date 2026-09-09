import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  XCircle,
  Calendar,
  Star,
  ShieldCheck,
  ChefHat,
  Clock,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";

const TYPE_META = {
  booking_request: { label: "New booking request", icon: Calendar, color: "var(--accent-amber)" },
  booking_accepted: { label: "Booking accepted", icon: CheckCircle2, color: "var(--accent-emerald)" },
  booking_rejected: { label: "Booking declined", icon: XCircle, color: "#dc2626" },
  booking_confirmed: { label: "Booking confirmed", icon: CheckCircle2, color: "var(--accent-blue)" },
  booking_completed: { label: "Booking completed", icon: CheckCheck, color: "var(--accent-emerald)" },
  booking_cancelled: { label: "Booking cancelled", icon: XCircle, color: "var(--slate-500)" },
  cook_arrived: { label: "Cook arrived", icon: ChefHat, color: "var(--accent-emerald)" },
  cooking_hours_completed: { label: "Cooking hours complete", icon: Clock, color: "var(--accent-amber)" },
  review_received: { label: "New review", icon: Star, color: "var(--accent-amber)" },
  profile_approved: { label: "Profile approved", icon: ShieldCheck, color: "var(--accent-emerald)" },
  profile_rejected: { label: "Profile needs attention", icon: AlertCircle, color: "#dc2626" },
  general: { label: "Update", icon: Bell, color: "var(--primary)" },
};

const timeAgo = (iso) => {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const Notifications = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [actioning, setActioning] = useState(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await API.get("/notifications");
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(async () => {
      try {
        const { data } = await API.get("/notifications");
        setNotifications(Array.isArray(data) ? data : []);
      } catch {
        // keep stale list on background poll failure
      }
    }, 30000);
    return () => clearInterval(id);
  }, []);

  const handleMarkRead = async (id) => {
    setActioning(id);
    try {
      const { data } = await API.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n._id === id ? data : n)));
    } catch (err) {
      showToast(err.response?.data?.message || "Could not mark as read", "error");
    } finally {
      setActioning(null);
    }
  };

  const handleMarkAllRead = async () => {
    setActioning("all");
    try {
      await API.patch("/notifications/read-all");
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      showToast("All notifications marked as read", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Could not mark all as read", "error");
    } finally {
      setActioning(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : filter === "read"
        ? notifications.filter((n) => n.read)
        : notifications;

  const backTo = user?.role === "cook" ? "/dashboard/cook-bookings" : "/dashboard/my-bookings";
  const backLabel = user?.role === "cook" ? "Back to Cook Dashboard" : "Back to My Bookings";

  return (
    <div className="dashboard-container">
      <Link to={backTo} className="back-link-bar" style={{ alignSelf: "flex-start" }}>
        <ArrowLeft size={16} /> {backLabel}
      </Link>

      <div className="dashboard-header-row">
        <div>
          <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
            <BellRing size={14} />
            {user?.role === "cook" ? "Cook Inbox" : "Customer Inbox"}
          </span>
          <h1>Notifications</h1>
          <p style={{ color: "var(--slate-600)", margin: 0 }}>
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}.`
              : "You're all caught up — new booking updates will appear here."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            className="btn btn-outline btn-sm"
            onClick={handleMarkAllRead}
            disabled={actioning === "all"}
          >
            <CheckCheck size={16} />
            {actioning === "all" ? "Marking..." : "Mark all as read"}
          </button>
        )}
      </div>

      <div className="dashboard-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--primary-light)", color: "var(--primary)" }}>
            <Bell size={24} />
          </div>
          <div>
            <div className="stat-metric-number">{notifications.length}</div>
            <div className="stat-metric-title">Total received</div>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--accent-amber-light)", color: "var(--accent-amber)" }}>
            <BellRing size={24} />
          </div>
          <div>
            <div className="stat-metric-number">{unreadCount}</div>
            <div className="stat-metric-title">Unread</div>
          </div>
        </div>
        <div className="dashboard-stat-card">
          <div className="stat-icon-wrapper" style={{ background: "var(--accent-emerald-light)", color: "var(--accent-emerald)" }}>
            <CheckCheck size={24} />
          </div>
          <div>
            <div className="stat-metric-number">{notifications.length - unreadCount}</div>
            <div className="stat-metric-title">Read</div>
          </div>
        </div>
      </div>

      <div className="tabs-navigation-bar">
        <button className={`tab-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          All ({notifications.length})
        </button>
        <button className={`tab-btn ${filter === "unread" ? "active" : ""}`} onClick={() => setFilter("unread")}>
          Unread ({unreadCount})
        </button>
        <button className={`tab-btn ${filter === "read" ? "active" : ""}`} onClick={() => setFilter("read")}>
          Read ({notifications.length - unreadCount})
        </button>
      </div>

      {error && (
        <div className="error-alert-banner">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {loading ? (
        <div className="loading-spinner-wrapper">
          <div className="spinner"></div>
          <p style={{ color: "var(--slate-500)", fontWeight: 600 }}>Loading notifications...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="bookings-list-modern">
          {filtered.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.general;
            const Icon = meta.icon;
            return (
              <div
                key={n._id}
                className="booking-item-card"
                style={{
                  borderLeft: n.read ? "1px solid var(--border-subtle)" : "4px solid var(--primary)",
                  background: n.read ? "white" : "var(--primary-light, #fff7ed)",
                }}
              >
                <div style={{ display: "flex", gap: "0.9rem", alignItems: "flex-start" }}>
                  <div
                    className="stat-icon-wrapper"
                    style={{ background: "white", color: meta.color, border: "1px solid var(--border-subtle)" }}
                  >
                    <Icon size={22} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                      <span className={`badge ${n.read ? "badge-slate" : "badge-festive"}`}>{meta.label}</span>
                      {!n.read && <span className="badge badge-amber">New</span>}
                      <span style={{ fontSize: "0.78rem", color: "var(--slate-500)" }}>{timeAgo(n.createdAt)}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: "0.95rem", color: "var(--slate-800)", fontWeight: n.read ? 400 : 600 }}>
                      {n.message}
                    </p>
                    <div style={{ fontSize: "0.75rem", color: "var(--slate-400)", marginTop: "0.35rem" }}>
                      {new Date(n.createdAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  {!n.read && (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleMarkRead(n._id)}
                      disabled={actioning === n._id}
                      title="Mark as read"
                    >
                      <CheckCircle2 size={15} />
                      {actioning === n._id ? "..." : "Mark read"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state-card">
          <div className="empty-state-icon">
            <Bell size={28} />
          </div>
          <h3>{filter === "all" ? "No notifications yet" : `No ${filter} notifications`}</h3>
          <p style={{ fontSize: "0.95rem", color: "var(--slate-600)", marginBottom: "1rem" }}>
            {filter === "all" ? (
              <>
                Booking requests, acceptances, arrivals, and reviews will show up here as soon as
                there is activity on your account.
              </>
            ) : (
              <>Try a different filter — or check back after your next booking update.</>
            )}
          </p>
          <Link to={backTo} className="btn btn-primary">
            {user?.role === "cook" ? <ChefHat size={16} /> : <Calendar size={16} />}
            {backLabel}
          </Link>
        </div>
      )}
    </div>
  );
};

export default Notifications;
