// CouponManagement — admin Coupons tab: list, create, edit, activate/deactivate,
// delete (server refuses deleting redeemed coupons — deactivate instead).
import React, { useState } from "react";
import API from "../api/axios";
import { useFetch } from "../hooks/useFetch";
import { useShowToast } from "../store/hooks";
import { formatDate } from "../utils/constants";
import CouponModal from "./CouponModal";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";

const CouponManagement = () => {
  const { data: coupons, loading, refetch } = useFetch("/coupons");
  const showToast = useShowToast();
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);

  const openCreate = () => {
    setEditingCoupon(null);
    setShowModal(true);
  };
  const openEdit = (coupon) => {
    setEditingCoupon(coupon);
    setShowModal(true);
  };

  const handleToggle = async (coupon) => {
    try {
      await API.patch(`/coupons/${coupon._id}`, { active: !coupon.active });
      showToast(
        coupon.active
          ? `Coupon ${coupon.code} deactivated — hidden from customers.`
          : `Coupon ${coupon.code} activated — live for customers.`,
        "success"
      );
      refetch();
    } catch (err) {
      showToast(err.response?.data?.message || "Update failed", "error");
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon ${coupon.code}? This cannot be undone (coupons that were already used are kept instead).`)) return;
    try {
      await API.delete(`/coupons/${coupon._id}`);
      showToast(`Coupon ${coupon.code} deleted`, "success");
      refetch();
    } catch (err) {
      showToast(err.response?.data?.message || "Delete failed", "error");
    }
  };

  const now = Date.now();
  const statusBadge = (c) => {
    if (c.active === false) return <span className="badge badge-rose">INACTIVE</span>;
    if (c.validTo && new Date(c.validTo).getTime() < now) return <span className="badge badge-amber">EXPIRED</span>;
    if (c.validFrom && new Date(c.validFrom).getTime() > now) return <span className="badge badge-amber">SCHEDULED</span>;
    return <span className="badge badge-emerald">ACTIVE</span>;
  };

  const windowLabel = (c) => {
    const from = c.validFrom ? formatDate(c.validFrom) : "now";
    const to = c.validTo ? formatDate(c.validTo) : "no expiry";
    return c.validFrom || c.validTo ? `${from} → ${to}` : "Always";
  };
  const usageLabel = (c) => {
    const used = Number(c.usedCount || 0);
    const limit = c.usageLimit != null ? ` / ${c.usageLimit}` : "";
    const per = c.perUserLimit != null ? `${c.perUserLimit}x / user` : "unlimited / user";
    return `${used}${limit} used • ${per}`;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Promo Coupons</h2>
          <p style={{ color: "var(--slate-500)", margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
            Create, edit or retire discount codes. Active offers appear on the home page automatically.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>
          <Plus size={16} /> New Coupon
        </button>
      </div>

      {loading ? (
        <div className="loading-spinner-wrapper">
          <div className="spinner"></div>
          <p>Loading coupons...</p>
        </div>
      ) : coupons && coupons.length > 0 ? (
        <div style={{ background: "white", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-subtle)", overflow: "auto" }}>
          <table className="coupon-table" style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.95rem", minWidth: 760 }}>
            <thead style={{ background: "var(--slate-50)", borderBottom: "1px solid var(--slate-200)" }}>
              <tr>
                <th style={{ padding: "1rem" }}>Coupon</th>
                <th style={{ padding: "1rem" }}>Discount</th>
                <th style={{ padding: "1rem" }}>Limits</th>
                <th style={{ padding: "1rem" }}>Window</th>
                <th style={{ padding: "1rem" }}>Status</th>
                <th style={{ padding: "1rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c._id} style={{ borderBottom: "1px solid var(--slate-100)" }}>
                  <td style={{ padding: "1rem" }}>
                    <span className="coupon-code-chip">{c.code}</span>
                    {c.description ? <div className="coupon-desc">{c.description}</div> : null}
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <div className="coupon-pct">
                      {c.discountType === "flat" ? `₹${c.flatAmount} OFF` : `${c.percent}% OFF`}
                    </div>
                    <div className="coupon-sub">
                      {c.discountType === "flat"
                        ? "flat discount"
                        : c.maxDiscount != null ? `max ₹${c.maxDiscount}` : "uncapped"}
                      {c.minOrder > 0 ? ` • min ₹${c.minOrder}` : ""}
                      {c.firstBookingOnly ? " • 1st booking" : ""}
                    </div>
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <div className="coupon-desc">{usageLabel(c)}</div>
                  </td>
                  <td style={{ padding: "1rem", whiteSpace: "nowrap" }}>{windowLabel(c)}</td>
                  <td style={{ padding: "1rem" }}>{statusBadge(c)}</td>
                  <td style={{ padding: "1rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(c)} title="Edit coupon">
                        <Pencil size={15} /> Edit
                      </button>
                      <button
                        className={`btn btn-sm ${c.active === false ? "btn-primary" : "btn-outline"}`}
                        onClick={() => handleToggle(c)}
                        title={c.active === false ? "Activate this coupon" : "Deactivate this coupon"}
                      >
                        {c.active === false ? <><Power size={15} /> Activate</> : <><PowerOff size={15} /> Deactivate</>}
                      </button>
                      <button className="btn btn-danger-outline btn-sm" onClick={() => handleDelete(c)} title="Delete coupon (only when never used)">
                        <Trash2 size={15} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ background: "white", border: "1px dashed var(--slate-300)", borderRadius: "var(--radius-lg)", padding: "2rem", textAlign: "center" }}>
          <p style={{ color: "var(--slate-500)", margin: 0 }}>No coupons yet — create the first one!</p>
        </div>
      )}

      <CouponModal
        open={showModal}
        coupon={editingCoupon}
        onClose={() => setShowModal(false)}
        onSaved={() => {
          setShowModal(false);
          refetch();
        }}
      />
    </div>
  );
};

export default CouponManagement;