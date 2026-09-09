import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import API from "../api/axios";
import {
  X,
  Copy,
  Check,
  ChefHat,
  PartyPopper,
  Clock,
  Gift,
  Flame,
  Star,
  ArrowRight,
} from "lucide-react";

const SEEN_KEY = "cm-festive-offer-seen";
const STRIP_KEY = "cm-festive-strip-dismissed";
// Ganesh Utsav 2026 (Sept 14 – Sept 25) — offer runs till midnight after
// Visarjan on Anant Chaturdashi (Sept 25).
const OFFER_END = new Date("2026-09-26T00:00:00");
// Promo code shown on the strip + popup. Fetched live from the backend
// /api/coupons/active list (admin-managed); this is the graceful fallback.
const OFFER_CODE = "BAPPA20";
const OFFER_PERCENT = 20;

const MODAK_IMG =
  "https://images.pexels.com/photos/33643272/pexels-photo-33643272.jpeg";

const PURAN_POLI_IMG = "https://images.pexels.com/photos/38229508/pexels-photo-38229508.jpeg"

const KARANJI_IMG = "https://images.pexels.com/photos/18488315/pexels-photo-18488315.jpeg"

const LADOO_IMG = "https://images.pexels.com/photos/8887021/pexels-photo-8887021.jpeg"

const SHRIKHAND_IMG = "https://images.pexels.com/photos/34131068/pexels-photo-34131068.jpeg"

const GULAB_JAMUN_IMG = "https://images.pexels.com/photos/15014919/pexels-photo-15014919.jpeg"

 
const FOODS = [
  {
    name: "Modak",
    tag: "−20%",
    tagClass: "off",
    src: MODAK_IMG,
    alt: "Steamed Ukadiche Modak for Ganesh Chaturthi",
  },
  {
    name: "Puran Poli",
    tag: "−15%",
    tagClass: "off",
    src: PURAN_POLI_IMG,
    alt: "Sweet Puran Poli flatbread",
  },
  {
    name: "Karanji",
    tag: "−25%",
    tagClass: "off",
    src: KARANJI_IMG,
    alt: "Fried Karanji sweet pastry",
  },
  {
    name: "Ladoo",
    tag: "−10%",
    tagClass: "off",
    src: LADOO_IMG,
    alt: "Bite-sized Motichoor Ladoo sweets",
  },
  {
    name: "Shrikhand",
    tag: "New",
    tagClass: "hot",
    src: SHRIKHAND_IMG,
    alt: "Creamy Shrikhand dessert",
  },
  {
    name: "Gulab Jamun",
    tag: "−18%",
    tagClass: "off",
    src: GULAB_JAMUN_IMG,
    alt: "Sweet Gulab Jamun",
  },
];

function useCountdown() {
  const calc = () => {
    const diff = Math.max(0, OFFER_END.getTime() - Date.now());
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff / 3600000) % 24),
      m: Math.floor((diff / 60000) % 60),
      s: Math.floor((diff / 1000) % 60),
      expired: diff <= 0,
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setT(calc()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
}

const pad = (n) => String(n).padStart(2, "0");

const FestiveOfferBillboard = () => {
  const [showModal, setShowModal] = useState(false);
  const [showStrip, setShowStrip] = useState(false);
  const [copied, setCopied] = useState(false);
  const { d, h, m, s, expired } = useCountdown();

  const [heroCode, setHeroCode] = useState(OFFER_CODE);
  const [heroPercent, setHeroPercent] = useState(OFFER_PERCENT);
  useEffect(() => {
    let alive = true;
    API.get("/coupons/active")
      .then((res) => {
        const list = Array.isArray(res?.data)
          ? res.data
              .filter((c) => c && c.code)
              .sort((a, b) => Number(b.percent || 0) - Number(a.percent || 0))
          : [];
        if (alive && list.length) {
          const top = list[0];
          setHeroCode(String(top.code).toUpperCase());
          if (top.percent != null) setHeroPercent(Number(top.percent));
        }
      })
      .catch(() => {
        /* backend down — keep the fallback default */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let timer;
    try {
      const seen = sessionStorage.getItem(SEEN_KEY);
      const stripOff = localStorage.getItem(STRIP_KEY);
      if (!stripOff) setShowStrip(true);
      if (!seen) {
        timer = setTimeout(() => setShowModal(true), 900);
      }
    } catch {
      timer = setTimeout(() => setShowModal(true), 900);
      setShowStrip(true);
    }
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showModal]);

  useEffect(() => {
    if (!showModal) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showModal]);

  const closeModal = () => {
    setShowModal(false);
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage unavailable — modal simply reappears next visit */
    }
  };

  const dismissStrip = () => {
    setShowStrip(false);
    try {
      localStorage.setItem(STRIP_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(heroCode);
    } catch {
      /* clipboard blocked — still show feedback */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <>
      {/* Festive billboard strip */}
      {showStrip && (
        <div className="festive-strip" role="region" aria-label="Festive offer">
          <p className="festive-strip-text">
            <PartyPopper size={15} className="festive-strip-pop" />
            <span>
              <strong>Ganesh Utsav — Up to {heroPercent}% OFF</strong>
              <span className="festive-strip-sub"> on festive cooks</span>{" "}
              <strong className="festive-strip-code">{heroCode}</strong>
            </span>{" "}
            <span className="festive-strip-timer">
              <Clock size={13} />
              {expired ? "Ends tonight!" : `Ends in ${d}d : ${pad(h)}h : ${pad(m)}m`}
            </span>
          </p>
          <button
            className="festive-strip-close"
            onClick={dismissStrip}
            aria-label="Dismiss festive offer banner"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Entry popup billboard */}
      {showModal && (
        <div
          className="festive-overlay"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
          aria-label="Festive offer"
        >
          <div className="festive-card" onClick={(e) => e.stopPropagation()}>
            <button
              className="festive-close"
              onClick={closeModal}
              aria-label="Close festive offer"
            >
              <X size={17} />
            </button>

            <div className="festive-body">
              <div className="festive-main">
                <p className="festive-eyebrow">
                  <span aria-hidden="true">🪔</span> Ganesh Utsav · Limited period
                </p>

                <h2 className="festive-title">
                  <span className="festive-title-first">Ganpati Bappa Morya,</span>{" "}
                  <span className="festive-title-gold"> Ghar Ka Swad!</span>
                </h2>

                <p className="festive-desc">
                  Book a verified festive cook and get fresh naivedya,
                  ukadiche modak &amp; festive meals made right in your kitchen.
                </p>

                <div className="festive-offer-row">
                  <div className="festive-mega">
                    <div className="festive-burst" aria-hidden="true">
                      <svg viewBox="0 0 100 100">
                        <path
                          d="M50 0 L58 12 L72 6 L74 20 L89 19 L86 33 L100 38 L92 50 L100 62 L86 67 L89 81 L74 80 L72 94 L58 88 L50 100 L42 88 L28 94 L26 80 L11 81 L14 67 L0 62 L8 50 L0 38 L14 33 L11 19 L26 20 L28 6 L42 12 Z"
                          fill="#ffd24d"
                        />
                      </svg>
                      <span>
                        UP
                        <br />
                        TO
                      </span>
                    </div>
                    <div className="festive-mega-num">
                      <span className="mega-20">{heroPercent}%</span>
                      <span className="mega-off">OFF</span>
                    </div>
                    <div className="festive-mega-side">
                      <span className="festive-mega-stars" aria-hidden="true">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={11} fill="#ffd24d" color="#ffd24d" />
                        ))}
                      </span>
                      <span>on festive cook bookings</span>
                    </div>
                  </div>

                  <div className="festive-countdown" role="timer" aria-label="Offer countdown">
                    <span className="festive-count-head">
                      <Flame size={14} className="festive-count-flame" />
                      <span className="festive-count-label">
                        {expired ? "Offer ends tonight — hurry!" : "Offer ends in"}
                      </span>
                    </span>
                    <div className="festive-count-boxes">
                      {[
                        [pad(d), "days"],
                        [pad(h), "hrs"],
                        [pad(m), "min"],
                        [pad(s), "sec"],
                      ].map(([v, l]) => (
                        <span key={l} className="festive-count-box">
                          <strong>{v}</strong>
                          <em>{l}</em>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="festive-showcase">
                <div className="festive-foods">
                  {FOODS.map((f) => (
                    <figure key={f.name} className="festive-food">
                      <span className="festive-food-ring">
                        <img src={f.src} alt={f.alt} loading="lazy" />
                        <span className={`festive-food-tag ${f.tagClass}`}>{f.tag}</span>
                      </span>
                      <figcaption>{f.name}</figcaption>
                    </figure>
                  ))}
                </div>
                <p className="festive-showcase-note">
                  Fresh naivedya & festive specials — cooked in your kitchen
                </p>
              </div>

              <div className="festive-bottom-row">
                <div className="festive-coupon">
                  <span className="festive-coupon-label">
                    <Gift size={15} /> Use code
                  </span>
                  <strong className="festive-coupon-code">{heroCode}</strong>
                  <button
                    className="festive-copy-btn"
                    onClick={copyCode}
                    aria-label={`Copy offer code ${heroCode}`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>

                <div className="festive-actions">
                  <Link
                    to="/cook-on-demand"
                    className="btn btn-lg festive-cta"
                    onClick={closeModal}
                  >
                    <ChefHat size={20} /> Book a Cook Now <ArrowRight size={20} />
                  </Link>
                  <button className="festive-maybe" onClick={closeModal}>
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FestiveOfferBillboard;