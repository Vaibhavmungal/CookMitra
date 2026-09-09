import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, ChefHat } from "lucide-react";

// Festive sweets & dishes carousel shown right below the navbar.
// Seamless infinite loop: the dish set is rendered 3x, the track starts in
// the middle copy, and scrolls wrapping past either edge jump back by exactly
// one set width — invisible because the content is identical. Auto-advances,
// pauses on hover / touch, with arrows + dots. Images reuse the proven
// Pexels URLs already used by the festive billboard.
const DISHES = [
  {
    name: "Ukadiche Modak",
    tag: "Bappa's favourite",
    src: "https://images.pexels.com/photos/33643272/pexels-photo-33643272.jpeg?auto=compress&cs=tinysrgb&w=600",
    alt: "Steamed Ukadiche Modak for Ganesh Chaturthi",
  },
  {
    name: "Puran Poli",
    tag: "Festive classic",
    src: "https://images.pexels.com/photos/38229508/pexels-photo-38229508.jpeg?auto=compress&cs=tinysrgb&w=600",
    alt: "Sweet Puran Poli flatbread",
  },
  {
    name: "Karanji",
    tag: "Crisp & sweet",
    src: "https://images.pexels.com/photos/18488315/pexels-photo-18488315.jpeg?auto=compress&cs=tinysrgb&w=600",
    alt: "Fried Karanji sweet pastry",
  },
  {
    name: "Motichoor Ladoo",
    tag: "Crowd pleaser",
    src: "https://images.pexels.com/photos/8887021/pexels-photo-8887021.jpeg?auto=compress&cs=tinysrgb&w=600",
    alt: "Bite-sized Motichoor Ladoo sweets",
  },
  {
    name: "Shrikhand",
    tag: "Creamy delight",
    src: "https://images.pexels.com/photos/34131068/pexels-photo-34131068.jpeg?auto=compress&cs=tinysrgb&w=600",
    alt: "Creamy Shrikhand dessert",
  },
  {
    name: "Gulab Jamun",
    tag: "Warm & soft",
    src: "https://images.pexels.com/photos/15014919/pexels-photo-15014919.jpeg?auto=compress&cs=tinysrgb&w=600",
    alt: "Sweet Gulab Jamun",
  },
];

const FALLBACK_IMG =
  "https://images.pexels.com/photos/33643272/pexels-photo-33643272.jpeg?auto=compress&cs=tinysrgb&w=600";

const AUTOPLAY_MS = 3500;
const COPIES = 3;
const MIDDLE_COPY = 1;

const DishCarousel = () => {
  const trackRef = useRef(null);
  const pauseRef = useRef(false);
  const [index, setIndex] = useState(0);

  // Three identical sets; only the middle one is interactive (outer copies
  // are aria-hidden so assistive tech doesn't read everything thrice).
  const items = useMemo(
    () =>
      Array.from({ length: COPIES }, (_, copy) =>
        DISHES.map((d) => ({ ...d, copy }))
      ).flat(),
    []
  );

  const cardStep = useCallback(() => {
    const track = trackRef.current;
    if (!track || !track.firstChild) return 0;
    const card = track.firstChild;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    return card.getBoundingClientRect().width + gap;
  }, []);

  // Pixel width of one full dish set.
  const setWidth = useCallback(() => cardStep() * DISHES.length, [cardStep]);

  // Start in the middle copy so there's always identical content on both
  // sides to wrap through. Runs before paint — no visible jump.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const w = cardStep() * DISHES.length;
    if (w > 0) track.scrollLeft = w;
  }, [cardStep]);

  // Fold any scroll position back into the middle copy (instant + invisible,
  // since all copies are identical), then sync the dots.
  const normalize = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 0;
    const step = cardStep();
    if (!step) return 0;
    const setW = step * DISHES.length;
    if (setW <= 0) return 0;
    let left = track.scrollLeft;
    if (left >= setW * (MIDDLE_COPY + 1) - 1) {
      left -= setW;
      track.scrollLeft = left;
    } else if (left < setW * MIDDLE_COPY && left > 1 && track.scrollWidth > setW * COPIES - 1) {
      // Only fold the lower copy when there's room above (keeps manual
      // swipes into the first copy smooth); the prev() button handles the
      // exact 0 edge explicitly below.
    }
    const rel = left - setW * MIDDLE_COPY;
    const i = ((Math.round(rel / step) % DISHES.length) + DISHES.length) % DISHES.length;
    setIndex((prevIdx) => (prevIdx === i ? prevIdx : i));
    return left;
  }, [cardStep]);

  // Keep dots in sync + wrap seamlessly on manual swipe / scroll.
  const onScroll = useCallback(() => {
    normalize();
  }, [normalize]);

  // A resize changes card widths — re-anchor into the middle copy at the
  // same dish so the loop never breaks.
  useEffect(() => {
    const onResize = () => {
      const track = trackRef.current;
      if (!track) return;
      const step = cardStep();
      if (!step) return;
      const setW = step * DISHES.length;
      const rel = track.scrollLeft - setW * MIDDLE_COPY;
      const i = ((Math.round(rel / step) % DISHES.length) + DISHES.length) % DISHES.length;
      track.scrollLeft = setW * MIDDLE_COPY + i * step;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [cardStep]);

  const goTo = useCallback((i) => {
    const track = trackRef.current;
    if (!track) return;
    const step = cardStep();
    if (!step) return;
    track.scrollTo({ left: step * DISHES.length * MIDDLE_COPY + i * step, behavior: "smooth" });
  }, [cardStep]);

  const next = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = cardStep();
    if (!step) return;
    // The onScroll wrapper folds us back seamlessly once we cross into the
    // third copy — sliding never stops or snaps back visibly.
    track.scrollTo({ left: track.scrollLeft + step, behavior: "smooth" });
  }, [cardStep]);

  const prev = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const step = cardStep();
    if (!step) return;
    // At the very start there's nothing to scroll into — hop forward one
    // identical set first (instant + invisible), then slide back one card.
    let base = track.scrollLeft;
    if (base - step < 1) {
      base += step * DISHES.length;
      track.scrollTo({ left: base });
    }
    track.scrollTo({ left: base - step, behavior: "smooth" });
  }, [cardStep]);

  // Autoplay; pauses while hovered, focused, touched, or tab hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (pauseRef.current || document.hidden) return;
      next();
    }, AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [next]);

  return (
    <section className="dish-carousel" aria-label="Festive sweets and dishes">
      <div className="dish-carousel-head">
        <div>
          <span className="section-eyebrow">Fresh From Our Cooks</span>
          <h2 className="dish-carousel-title">Sweets & Festive Dishes</h2>
        </div>
        <div className="dish-carousel-nav">
          <button
            type="button"
            className="dish-carousel-arrow"
            onClick={prev}
            aria-label="Previous dishes"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            className="dish-carousel-arrow"
            onClick={next}
            aria-label="Next dishes"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        className="dish-carousel-track"
        ref={trackRef}
        onScroll={onScroll}
        onMouseEnter={() => { pauseRef.current = true; }}
        onMouseLeave={() => { pauseRef.current = false; }}
        onFocus={() => { pauseRef.current = true; }}
        onBlur={() => { pauseRef.current = false; }}
        onTouchStart={() => { pauseRef.current = true; }}
        onTouchEnd={() => { pauseRef.current = false; }}
      >
        {items.map((d) => {
          const decorative = d.copy !== MIDDLE_COPY;
          return (
            <Link
              key={`${d.copy}-${d.name}`}
              to="/cook-on-demand"
              className="dish-card"
              aria-label={`${d.name} — book a cook to make it`}
              aria-hidden={decorative || undefined}
              tabIndex={decorative ? -1 : undefined}
            >
              <span className="dish-card-imgwrap">
                <img
                  src={d.src}
                  alt={decorative ? "" : d.alt}
                  loading="lazy"
                  onError={(e) => {
                    if (e.currentTarget.src !== FALLBACK_IMG) e.currentTarget.src = FALLBACK_IMG;
                  }}
                />
                <span className="dish-card-tag">{d.tag}</span>
              </span>
              <span className="dish-card-name">{d.name}</span>
            </Link>
          );
        })}
      </div>

      <div className="dish-carousel-dots" role="tablist" aria-label="Carousel pages">
        {DISHES.map((d, i) => (
          <button
            key={d.name}
            type="button"
            role="tab"
            aria-selected={index === i}
            aria-label={`Go to ${d.name}`}
            className={`dish-carousel-dot ${index === i ? "active" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <div className="dish-carousel-cta">
        <Link to="/cook-on-demand" className="btn btn-primary">
          <ChefHat size={16} /> Get these cooked fresh at home
        </Link>
      </div>
    </section>
  );
};

export default DishCarousel;
