import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck, FileText, RotateCcw, Mail } from "lucide-react";

const SUPPORT_EMAIL = "contactuscookmitra@gmail.com";
const SUPPORT_PHONE = "+91 7231925496";
const UPDATED = "September 2026";

// Shared layout for the compliance pages Razorpay requires merchants to
// publish: Terms, Privacy, Refunds/Cancellation, and Contact.
const LegalShell = ({ icon: Icon, eyebrow, title, intro, children }) => (
  <div className="dashboard-container legal-page">
    <Link to="/" className="back-link-bar" style={{ marginBottom: "1rem" }}>
      <ArrowLeft size={16} /> Back to Home
    </Link>
    <span className="badge badge-festive" style={{ marginBottom: "0.5rem" }}>
      <Icon size={14} /> {eyebrow}
    </span>
    <h1>{title}</h1>
    <p style={{ color: "var(--slate-600)", margin: "0.25rem 0 1.25rem" }}>
      {intro} Last updated: {UPDATED}.
    </p>
    <div className="profile-card-block legal-content">{children}</div>
  </div>
);

export const TermsConditions = () => (
  <LegalShell
    icon={FileText}
    eyebrow="Legal"
    title="Terms & Conditions"
    intro="These terms govern your use of Cook Mitra (cookmitra) for booking home-cooking sessions."
  >
    <h3>1. The service</h3>
    <p>
      Cook Mitra connects households ("customers") with verified independent home cooks
      ("cooks") for in-home cooking sessions: Cook for Me, Cook With Me, Teach Me, and
      Preparation Help. Cooks are independent providers, not employees of Cook Mitra.
    </p>
    <h3>2. Booking & acceptance</h3>
    <ul>
      <li>You pick a date, service hours, and one of the cook's available time slots.</li>
      <li>Your request holds the slot for 5 minutes while the cook accepts or declines.</li>
      <li>Once accepted, you have 5 minutes to complete online payment; unpaid requests auto-cancel and release the slot.</li>
      <li>Only approved, verified cooks can receive requests.</li>
    </ul>
    <h3>3. Pricing & payments</h3>
    <ul>
      <li>Fee = the cook's hourly rate × booked hours, shown before you pay. No hidden charges.</li>
      <li>Online payments are processed securely by Razorpay (UPI, cards, net-banking, wallets). We never see or store your card/UPI credentials.</li>
      <li>Prices are in Indian Rupees (INR) and inclusive of applicable taxes.</li>
    </ul>
    <h3>4. Cancellation & refunds</h3>
    <p>
      Cancellations follow our <Link to="/refunds">Cancellation & Refund Policy</Link>:
      paid bookings cancelled in time are refunded to the original payment method within
      5–7 business days.
    </p>
    <h3>5. Your responsibilities</h3>
    <ul>
      <li>Provide an accurate service address and be available at the venue on time.</li>
      <li>Ensure a safe, hygienic workspace and disclose allergies or dietary restrictions.</li>
      <li>Do not misuse the platform, share false information, or harass cooks.</li>
    </ul>
    <h3>6. Liability</h3>
    <p>
      Cook Mitra verifies cook identities and documents but is not liable for the quality
      of a session, delays, or events beyond our control. Liability, where applicable, is
      limited to the fee paid for the affected booking.
    </p>
    <h3>7. Contact</h3>
    <p>
      Questions about these terms: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ·{" "}
      <a href="tel:+917231925496">{SUPPORT_PHONE}</a>.
    </p>
  </LegalShell>
);

export const PrivacyPolicy = () => (
  <LegalShell
    icon={ShieldCheck}
    eyebrow="Legal"
    title="Privacy Policy"
    intro="How Cook Mitra collects, uses, and protects your information."
  >
    <h3>1. What we collect</h3>
    <ul>
      <li>Account details: name, email, phone number, role (customer/cook).</li>
      <li>Booking details: service address, venue location pin, guests, dishes, notes.</li>
      <li>Cook verification documents (Aadhaar/PAN/photo) for cooks.</li>
      <li>Payment confirmations (order/payment IDs and amounts) — card and UPI credentials are handled only by Razorpay and never touch our servers.</li>
    </ul>
    <h3>2. How we use it</h3>
    <ul>
      <li>To create accounts, process bookings, and coordinate sessions over WhatsApp/SMS.</li>
      <li>To share necessary details with the other party (your cook gets your name, contact, and venue; you get the cook's name and contact for confirmed bookings).</li>
      <li>To prevent fraud, resolve disputes, and improve the service.</li>
    </ul>
    <h3>3. Sharing</h3>
    <p>
      We do not sell your data. We share it only with the assigned cook/customer for a
      booking, with Razorpay for payment processing, and with authorities when legally
      required.
    </p>
    <h3>4. Security & retention</h3>
    <p>
      Data travels over encrypted connections and passwords are stored hashed. We keep
      booking records as required for accounts and dispute resolution.
    </p>
    <h3>5. Your rights</h3>
    <p>
      You may request access, correction, or deletion of your personal data at{" "}
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Deletion may require
      closing bookings that legally must be retained.
    </p>
  </LegalShell>
);

export const RefundPolicy = () => (
  <LegalShell
    icon={RotateCcw}
    eyebrow="Legal"
    title="Cancellation & Refund Policy"
    intro="When you can cancel and how refunds reach you."
  >
    <h3>1. Free cancellation window</h3>
    <ul>
      <li>Requests cancelled before the cook accepts are free and release the slot instantly — nothing is charged.</li>
      <li>Requests the cook declines, or that expire unanswered, are never charged.</li>
    </ul>
    <h3>2. Cancelling a paid booking</h3>
    <ul>
      <li>Cancel anytime before the session starts from My Bookings or the booking page.</li>
      <li>Paid bookings are refunded automatically to the original payment method (UPI/card/net-banking/wallet).</li>
      <li>Refunds reach your account within 5–7 business days, per bank timelines.</li>
      <li>If the automatic refund fails, our team settles it manually and notifies you — write to us with your payment ID.</li>
    </ul>
    <h3>3. Non-refundable cases</h3>
    <ul>
      <li>Completed sessions are not refundable — rate your experience instead.</li>
      <li>Test-mode checkouts move no real money, so there is nothing to refund.</li>
    </ul>
    <h3>4. Payment-window expiry</h3>
    <p>
      If the 5-minute payment window lapses, the slot is released and no money is
      charged. If money was captured but the booking could not be confirmed (for
      example, you closed the browser mid-payment), contact us with the Razorpay
      payment ID and we will confirm or refund it.
    </p>
    <h3>5. Support</h3>
    <p>
      Refund help: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> ·{" "}
      <a href="tel:+917231925496">{SUPPORT_PHONE}</a>. Please include your booking ID
      and Razorpay payment ID.
    </p>
  </LegalShell>
);

export const ContactUs = () => (
  <LegalShell
    icon={Mail}
    eyebrow="Support"
    title="Contact Us"
    intro="We reply within one business day."
  >
    <h3>Cook Mitra Support</h3>
    <ul>
      <li>
        Email: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      </li>
      <li>
        Phone / WhatsApp: <a href="tel:+917231925496">{SUPPORT_PHONE}</a>
      </li>
      <li>Area: Pune & Mumbai, India</li>
      <li>
        Instagram:{" "}
        <a href="https://instagram.com/contactuscookmitra" target="_blank" rel="noreferrer">
          @contactuscookmitra
        </a>
      </li>
      <li>Hours: 9:00 AM – 9:00 PM IST, all days</li>
    </ul>
    <h3>What to include</h3>
    <p>
      For booking or payment issues, mention your registered phone number, booking ID,
      and (for payments) the Razorpay payment ID from your booking receipt.
    </p>
  </LegalShell>
);
