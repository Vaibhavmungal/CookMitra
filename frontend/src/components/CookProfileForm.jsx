import React, { useState, useEffect } from "react";
import API from "../api/axios";
import { useToast } from "../context/ToastContext";
import { SERVICE_DETAILS } from "../utils/constants";
import CookDocUploads from "./CookDocUploads";
import { ChefHat, Check, AlertCircle } from "lucide-react";

const SERVICE_OPTIONS = ["cook_for_me", "cook_with_me", "teach_me", "preparation_help"];

// Single source of truth for the cook profile form, shared by the Cook Setup
// page and the cook dashboard's profile tab (they previously duplicated each
// other and had already diverged — the dashboard copy silently dropped the
// home address and additional documents fields).
// Props:
//   createTitle / manageTitle — headings for first-time vs existing profiles
//   showStatus — show the admin verification badge (setup page)
//   onSaved(profile, isUpdate) — optional callback after a successful save
const CookProfileForm = ({
  createTitle = "Create Cook Profile",
  manageTitle = "Manage Cook Profile",
  showStatus = false,
  onSaved,
}) => {
  const { showToast } = useToast();
  const [formData, setFormData] = useState({
    bio: "",
    experienceYears: 0,
    specialties: "",
    serviceTypes: [],
    rate: "",
    serviceArea: "",
    address: "",
    documents: [],
    aadharCardUrl: "",
    panCardUrl: "",
    photoUrl: "",
  });
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await API.get("/cooks/me");
        setExisting(res.data);
        setFormData({
          bio: res.data.bio || "",
          experienceYears: res.data.experienceYears ?? 0,
          specialties: (res.data.specialties || []).join(", "),
          serviceTypes: res.data.serviceTypes || [],
          rate: res.data.rate ?? "",
          serviceArea: res.data.serviceArea || "",
          address: res.data.address || "",
          documents: res.data.documents || [],
          aadharCardUrl: res.data.aadharCardUrl || "",
          panCardUrl: res.data.panCardUrl || "",
          photoUrl: res.data.photoUrl || "",
        });
      } catch (err) {
        if (err.response?.status !== 404) {
          setError(err.response?.data?.message || "Failed to load profile");
        }
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleServiceType = (type) => {
    setFormData((prev) => ({
      ...prev,
      serviceTypes: prev.serviceTypes.includes(type)
        ? prev.serviceTypes.filter((t) => t !== type)
        : [...prev.serviceTypes, type],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.aadharCardUrl) {
      const msg = "Please upload your Aadhaar card";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (!formData.panCardUrl) {
      const msg = "Please upload your PAN card";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    if (formData.serviceTypes.length === 0) {
      const msg = "Please select at least one service you can offer";
      setError(msg);
      showToast(msg, "error");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      bio: formData.bio,
      experienceYears: Number(formData.experienceYears),
      specialties: formData.specialties
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      serviceTypes: formData.serviceTypes,
      rate: Number(formData.rate),
      serviceArea: formData.serviceArea,
      address: formData.address,
      aadharCardUrl: formData.aadharCardUrl,
      panCardUrl: formData.panCardUrl,
      photoUrl: formData.photoUrl || "",
      documents: (formData.documents || [])
        .map((d) => ({ label: (d.label || "").trim(), url: (d.url || "").trim() }))
        .filter((d) => d.label || d.url),
    };

    try {
      const isUpdate = Boolean(existing);
      const res = isUpdate
        ? await API.put(`/cooks/${existing._id}`, payload)
        : await API.post("/cooks", payload);
      setExisting(res.data);
      showToast(
        isUpdate ? "Chef profile updated successfully!" : "Profile submitted for admin approval!",
        "success"
      );
      // Tell the navbar to reload the (possibly new) profile photo.
      window.dispatchEvent(new Event("cook-photo-updated"));
      onSaved?.(res.data, isUpdate);
    } catch (err) {
      const msg = err.response?.data?.message || "Failed to save profile";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-spinner-wrapper">
        <div className="spinner"></div>
        <p>Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-card-block">
      <div className="cook-setup-head">
        <ChefHat size={22} />
        <h1>{existing ? manageTitle : createTitle}</h1>
      </div>

      {showStatus && existing && (
        <div style={{ marginBottom: "1.5rem" }}>
          <span style={{ fontSize: "0.9rem", color: "var(--slate-500)", marginRight: 8 }}>
            Verification Status:
          </span>
          <span
            className={`badge ${
              existing.approvalStatus === "approved"
                ? "badge-emerald"
                : existing.approvalStatus === "rejected"
                ? "badge-rose"
                : "badge-amber"
            }`}
          >
            {existing.approvalStatus?.toUpperCase()}
          </span>
        </div>
      )}

      {error && (
        <div className="error-alert-banner">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="booking-form-group">
          <label>Chef Bio</label>
          <textarea
            name="bio"
            rows={3}
            className="form-control"
            value={formData.bio}
            onChange={handleChange}
            placeholder="Tell families about your home cooking background and signature festival sweets..."
          />
        </div>

        <div className="cook-form-grid-2">
          <div className="booking-form-group">
            <label>Experience (Years)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              name="experienceYears"
              className="form-control"
              value={formData.experienceYears}
              onChange={handleChange}
              min="0"
            />
          </div>
          <div className="booking-form-group">
            <label>Hourly Rate (₹)</label>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.]?[0-9]*"
              name="rate"
              className="form-control"
              value={formData.rate}
              onChange={handleChange}
              min="0"
              required
            />
          </div>
        </div>

        <div className="booking-form-group">
          <label>Specialties (Comma-separated)</label>
          <input
            name="specialties"
            className="form-control"
            value={formData.specialties}
            onChange={handleChange}
            placeholder="Chakli, Karanji, Modak, Puran Poli"
          />
        </div>

        <div className="booking-form-group">
          <label>Primary Service Area</label>
          <input
            name="serviceArea"
            className="form-control"
            value={formData.serviceArea}
            onChange={handleChange}
            placeholder="e.g. Pune, Baner, Kothrud"
          />
        </div>

        <div className="booking-form-group">
          <label>Home Address (visible to admin)</label>
          <textarea
            name="address"
            rows={2}
            className="form-control"
            value={formData.address}
            onChange={handleChange}
            placeholder="e.g. Flat 4B, Sunshine Society, Baner Road, Pune 411045"
          />
        </div>

        <CookDocUploads
          aadharCardUrl={formData.aadharCardUrl}
          panCardUrl={formData.panCardUrl}
          photoUrl={formData.photoUrl}
          onChange={(key, url) => setFormData((prev) => ({ ...prev, [key]: url }))}
          onError={(msg) => setError(msg)}
          onUploadingChange={setUploadingDocs}
        />

        <div className="booking-form-group">
          <label style={{ marginBottom: "0.75rem" }}>
            Additional Documents (optional, visible to admin)
          </label>
          {(formData.documents || []).map((doc, i) => (
            <div key={i} className="cook-doc-grid">
              <input
                className="form-control"
                value={doc.label || ""}
                onChange={(e) => {
                  const docs = [...(formData.documents || [])];
                  docs[i] = { ...docs[i], label: e.target.value };
                  setFormData((prev) => ({ ...prev, documents: docs }));
                }}
                placeholder="e.g. Aadhaar Card"
              />
              <input
                className="form-control"
                value={doc.url || ""}
                onChange={(e) => {
                  const docs = [...(formData.documents || [])];
                  docs[i] = { ...docs[i], url: e.target.value };
                  setFormData((prev) => ({ ...prev, documents: docs }));
                }}
                placeholder="Document link (https://...)"
              />
              <button
                type="button"
                className="btn btn-danger-outline btn-sm"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    documents: (prev.documents || []).filter((_, j) => j !== i),
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() =>
              setFormData((prev) => ({
                ...prev,
                documents: [...(prev.documents || []), { label: "", url: "" }],
              }))
            }
          >
            + Add Document
          </button>
        </div>

        <div className="booking-form-group">
          <label style={{ marginBottom: "0.75rem" }}>Services You Can Offer</label>
          <div className="cook-service-toggles">
            {SERVICE_OPTIONS.map((type) => {
              const isSelected = formData.serviceTypes.includes(type);
              const info = SERVICE_DETAILS[type] || { label: type.replace(/_/g, " ") };
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleServiceType(type)}
                  className={`cook-service-toggle${isSelected ? " selected" : ""}`}
                  aria-pressed={isSelected}
                >
                  <span>{info.label}</span>
                  {isSelected && <Check size={16} />}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={saving || uploadingDocs}
          style={{ marginTop: "1.5rem" }}
        >
          {saving
            ? "Saving Details..."
            : uploadingDocs
            ? "Uploading files..."
            : existing
            ? "Update Profile"
            : "Submit for Approval"}
        </button>
      </form>
    </div>
  );
};

export default CookProfileForm;
