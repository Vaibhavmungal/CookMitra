import React from "react";
import { Link } from "react-router-dom";
import CookProfileForm from "../components/CookProfileForm";
import { ArrowLeft } from "lucide-react";

const CookSetup = () => {
  return (
    <div className="cook-setup-page">
      <div style={{ marginBottom: "1.5rem" }}>
        <Link to="/dashboard/cook-bookings" className="back-link-bar">
          <ArrowLeft size={16} /> Back to Cook Dashboard
        </Link>
      </div>

      <CookProfileForm showStatus />
    </div>
  );
};

export default CookSetup;
