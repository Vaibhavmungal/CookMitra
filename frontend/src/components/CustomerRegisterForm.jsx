import { useState } from "react";
import { User, MessageCircle, MapPin, Send, CheckCircle2, PartyPopper, LocateFixed, Check } from "lucide-react";
import API from "../api/axios";

const normalizeWhatsapp = (input) => {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
};

const validateField = (name, value) => {
  if (name === "name") {
    if (!value.trim()) return "Please enter your full name";
    if (value.trim().length < 2) return "Name must be at least 2 characters";
    if (!/^[a-zA-Z\s.'-]+$/.test(value.trim()))
      return "Name can only contain letters, spaces and . ' -";
    return "";
  }
  if (name === "whatsapp") {
    if (!String(value).trim()) return "Please enter your WhatsApp number";
    if (!/^[6-9]\d{9}$/.test(normalizeWhatsapp(value)))
      return "Enter a valid 10-digit Indian mobile number (starts with 6-9)";
    return "";
  }
  if (name === "location") {
    if (!value.trim()) return "Please enter your location";
    if (value.trim().length < 2) return "Location must be at least 2 characters";
    return "";
  }
  return "";
};

const CustomerRegisterForm = () => {
  const [formData, setFormData] = useState({ name: "", whatsapp: "", location: "" });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState("");
  const [coords, setCoords] = useState(null);
  const [copied, setCopied] = useState(false);

  const mapsLink = coords
    ? `https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : "";

  const handleCopyLink = async () => {
    if (!mapsLink) return;
    try {
      await navigator.clipboard.writeText(mapsLink);
    } catch {
      const input = document.getElementById("lead-maps-link");
      if (input) {
        input.select();
        document.execCommand("copy");
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocMsg("Geolocation is not supported by your browser");
      return;
    }
    if (window.isSecureContext === false) {
      setLocMsg("Browser blocks location on non-HTTPS sites — please type your location");
      return;
    }
    setLocating(true);
    setLocMsg("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lng: longitude });
        try {
          const r = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          const d = await r.json();
          const city = d.city || d.locality || d.principalSubdivision || "";
          if (city) {
            setFormData((f) => ({ ...f, location: city }));
            setTouched((t) => ({ ...t, location: true }));
            setErrors((e) => ({ ...e, location: validateField("location", city) }));
            setLocMsg(`Location detected: ${city}`);
          } else {
            throw new Error("empty");
          }
        } catch {
          try {
            const r2 = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
            );
            const d2 = await r2.json();
            const city =
              d2.address?.city ||
              d2.address?.town ||
              d2.address?.village ||
              d2.address?.state ||
              "";
            if (city) {
              setFormData((f) => ({ ...f, location: city }));
              setTouched((t) => ({ ...t, location: true }));
              setErrors((e) => ({ ...e, location: validateField("location", city) }));
              setLocMsg(`Location detected: ${city}`);
            } else {
              setLocMsg("Pin saved — please type your city / area name");
            }
          } catch {
            setLocMsg("Pin saved — please type your city / area name");
          }
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setLocMsg("Location permission denied — please type your location");
      },
      { timeout: 12000 }
    );
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    const next = { ...formData, [name]: value };
    setFormData(next);
    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validateField(name, value) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nextErrors = {
      name: validateField("name", formData.name),
      whatsapp: validateField("whatsapp", formData.whatsapp),
      location: validateField("location", formData.location),
    };
    setErrors(nextErrors);
    setTouched({ name: true, whatsapp: true, location: true });
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setServerError("");
    try {
      const payload = {
        name: formData.name.trim(),
        whatsapp: normalizeWhatsapp(formData.whatsapp),
        location: formData.location.trim(),
      };
      if (coords) payload.coords = coords;
      await API.post("/leads", payload);
      setSuccess(true);
    } catch (err) {
      setServerError(
        err.response?.data?.message || "Registration failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = (name) =>
    `form-control lead-input ${errors[name] ? "input-error" : ""} ${
      touched[name] && !errors[name] ? "input-valid" : ""
    }`;

  if (success) {
    return (
      <div className="lead-success-card">
        <PartyPopper size={44} className="lead-success-icon" />
        <h3>You're registered, {formData.name.split(" ")[0]}!</h3>
        <p>
          Our team will reach out to you on WhatsApp at{" "}
          <strong>+91 {normalizeWhatsapp(formData.whatsapp)}</strong> shortly
          with festive cooks near <strong>{formData.location}</strong>.
        </p>
        <button
          className="btn btn-outline"
          onClick={() => {
            setSuccess(false);
            setFormData({ name: "", whatsapp: "", location: "" });
            setTouched({});
            setErrors({});
            setCoords(null);
            setLocMsg("");
            setCopied(false);
          }}
        >
          Register another number
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="lead-form" noValidate>
      <div className="form-group">
        <label htmlFor="lead-name">
          <User size={15} /> Full Name
        </label>
        <input
          id="lead-name"
          type="text"
          name="name"
          className={fieldClass("name")}
          placeholder="e.g. Neha Sharma"
          value={formData.name}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="name"
        />
        {errors.name && <span className="field-error">{errors.name}</span>}
      </div>

      <div className="form-group">
        <label htmlFor="lead-whatsapp">
          <MessageCircle size={15} /> WhatsApp Number
        </label>
        <div className="phone-input-group">
          <span className="phone-prefix">+91</span>
          <input
            id="lead-whatsapp"
            type="tel"
            name="whatsapp"
            className={fieldClass("whatsapp")}
            placeholder="98765 43210"
            value={formData.whatsapp}
            onChange={handleChange}
            onBlur={handleBlur}
            inputMode="numeric"
            maxLength={14}
            autoComplete="tel"
          />
        </div>
        {errors.whatsapp ? (
          <span className="field-error">{errors.whatsapp}</span>
        ) : (
          <span className="field-hint">We'll contact you on this WhatsApp number</span>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="lead-location">
          <MapPin size={15} /> Your Location
        </label>
        <button
          type="button"
          className="btn btn-outline btn-sm detect-btn"
          onClick={handleDetectLocation}
          disabled={locating}
        >
          <LocateFixed size={15} />
          {locating ? "Detecting location..." : "Auto-detect my location"}
        </button>
        <input
          id="lead-location"
          type="text"
          name="location"
          className={fieldClass("location")}
          placeholder="e.g. Kothrud, Pune"
          value={formData.location}
          onChange={handleChange}
          onBlur={handleBlur}
          autoComplete="address-level2"
        />
        {locMsg && (
          <span className={locMsg.startsWith("Location detected") ? "field-hint" : "field-error"} style={locMsg.startsWith("Location detected") ? { color: "#16a34a", fontWeight: 600 } : undefined}>
            {locMsg}
          </span>
        )}
        {errors.location && <span className="field-error">{errors.location}</span>}
        {coords && (
          <div className="form-group" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            <label htmlFor="lead-maps-link">
              <MapPin size={15} /> Google Maps link of your location
            </label>
            <div className="maps-link-group">
              <input
                id="lead-maps-link"
                type="text"
                className="form-control"
                value={mapsLink}
                readOnly
                onFocus={(e) => e.target.select()}
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={handleCopyLink}>
                {copied ? (
                  <>
                    <Check size={15} /> Copied
                  </>
                ) : (
                  "Copy"
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {serverError && <div className="error-message">{serverError}</div>}

      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={submitting}>
        {submitting ? (
          "Registering..."
        ) : (
          <>
            <Send size={17} /> Register for Festive Updates
          </>
        )}
      </button>
      <p className="lead-privacy-note">
        <CheckCircle2 size={13} /> No spam, ever. Only festive cook availability near you.
      </p>
    </form>
  );
};

export default CustomerRegisterForm;
