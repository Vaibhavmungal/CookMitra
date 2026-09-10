import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from "lucide-react";
import aiCook2 from "../assets/carousel-2.png";
import aiCook3 from "../assets/carousel-3.png";
import aiCook5 from "../assets/carousel-5.png";
import coupleImg from "../assets/carousel-couple.png";
import promoVideo from "../assets/carousel-promo.mp4";

// Home-cooking slider: the active card is centered with a peek of the
// previous/next cards on either side, looping forever in both directions.
// No cloned copies anywhere: after each slide the order rotates and the
// film snaps back instantly to the identical position, so the loop is
// seamless yet every visible card is unique.
const AUTOPLAY_MS = 2500;

// Fisher-Yates shuffle — randomises card order once per page load.
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const DISHES = shuffle([
  {
    name: "Cook Together",
    tag: "Learn as you go",
    src: coupleImg,
    alt: "Happy couple in Cook Mitra aprons cooking a festive meal together",
  },
  {
    name: "Festive Specials",
    tag: "Fresh from the kitchen",
    src: aiCook2,
    alt: "Festive dish fresh from a CookMitra home kitchen",
  },
  {
    name: "Traditional Delights",
    tag: "Authentic taste",
    src: aiCook3,
    alt: "Traditional festive delight prepared at home",
  },
  {
    name: "Festive Favourites",
    tag: "Crowd pleasers",
    src: aiCook5,
    alt: "Festive favourite dish from the CookMitra kitchen",
  },
  {
    name: "Celebration in Motion",
    tag: "Watch the magic",
    src: promoVideo,
    type: "video",
    alt: "Festive cooking celebration video",
  },
]);

const FALLBACK_IMG = aiCook2;
const N = DISHES.length;

// Render order with the active dish at slot 2: [prev2, prev, active, next, …].
// Two predecessors buffer the left side so narrow frames never expose
// empty stage before the first image; only slots 0–4 are ever near screen.
const orderFor = (active) => [
  (active - 2 + N) % N,
  (active - 1 + N) % N,
  ...Array.from({ length: N - 2 }, (_, k) => (active + k) % N),
];

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const DishCarousel = () => {
  const [index, setIndex] = useState(0);
  // Retry tick: re-arms the autoplay timer when a tick fires while blocked.
  const [retry, setRetry] = useState(0);
  // Video voice: browsers may block unmuted autoplay — then we fall back to
  // muted and let the viewer unmute via the overlay button.
  const [muted, setMuted] = useState(false);

  const stageRef = useRef(null);
  const filmRef = useRef(null);
  const videoRef = useRef(null);
  const pauseRef = useRef(false);
  const quickRef = useRef(false);
  const touchXRef = useRef(null);
  const lastSwipeRef = useRef(0);
  // True while a slide animation is in flight — all navigation funnels
  // through this single flag.
  const flyingRef = useRef(false);
  // The running WAAPI animation, if any.
  const flyRef = useRef(null);
  // Safety net: guarantees a flight always settles, even if its finish
  // handlers are ever lost.
  const safetyRef = useRef(null);
  const indexRef = useRef(0);
  indexRef.current = index;

  const order = orderFor(index);

  // translateX that centers slot `pos` in the stage.
  const centerFor = useCallback((pos) => {
    const stage = stageRef.current;
    const film = filmRef.current;
    if (!stage || !film || !film.firstChild) return 0;
    const frame = film.firstChild;
    const frameW = frame.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(film).columnGap || getComputedStyle(film).gap) || 0;
    return -(pos * (frameW + gap) - (stage.clientWidth - frameW) / 2);
  }, []);

  const applyTransform = useCallback(
    (pos) => {
      const film = filmRef.current;
      if (film) film.style.transform = `translateX(${centerFor(pos)}px)`;
    },
    [centerFor]
  );

  // Keep the centered active card (slot 2) positioned. There is no CSS
  // transition on the film — all motion runs through WAAPI below — so this
  // is always instant and can never race a paint.
  // Layout effect (NOT passive effect): the recenter must land before the
  // browser paints, otherwise one wrong frame flashes after every slide.
  useLayoutEffect(() => {
    applyTransform(2);
  }, [index, applyTransform]);

  useEffect(() => {
    const onResize = () => {
      // Settle any flight first so measurements below are exact, then
      // recenter for the new viewport width.
      settleFlight();
      applyTransform(2);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (safetyRef.current) clearTimeout(safetyRef.current);
      if (flyRef.current) {
        try {
          flyRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settles the running flight exactly once (finish, cancel, or safety
  // timeout all funnel here), then commits the target index.
  // `destPos` — when provided — is stamped onto film.style.transform BEFORE
  // the animation is cancelled so React's re-render (triggered immediately
  // after by setIndex) sees the film already at the right position, and the
  // useLayoutEffect recenter is a no-op rather than a visible snap.
  const settleFlight = useCallback((destPos) => {
    const anim = flyRef.current;
    flyRef.current = null;
    if (safetyRef.current) {
      clearTimeout(safetyRef.current);
      safetyRef.current = null;
    }
    const wasFlying = flyingRef.current;
    flyingRef.current = false;
    // Stamp the destination transform BEFORE cancelling the animation so
    // the film sits in the correct place the instant React re-renders.
    if (destPos !== undefined) {
      const film = filmRef.current;
      if (film) film.style.transform = `translateX(${centerFor(destPos)}px)`;
    }
    if (anim) {
      try {
        anim.cancel();
      } catch {
        // ignore — cancelling an ended animation throws in some browsers
      }
    }
    return wasFlying;
  }, [centerFor]);

  const commitSlide = useCallback(
    (pos, to) => {
      settleFlight(pos);
      setIndex(to);
    },
    [settleFlight]
  );

  // Glide the film so `pos` centers, then commit the matching index. One
  // animation primitive, one settle path — nothing to race.
  const slideTo = useCallback(
    (pos, to) => {
      const film = filmRef.current;
      if (reducedMotion() || !film || !film.animate) {
        commitSlide(pos, to);
        return;
      }
      // Finish any stray flight before starting a new one.
      settleFlight();
      flyingRef.current = true;
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        commitSlide(pos, to);
      };
      try {
        const anim = film.animate(
          [
            { transform: film.style.transform || "translateX(0px)" },
            { transform: `translateX(${centerFor(pos)}px)` },
          ],
          { duration: 550, easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" }
        );
        flyRef.current = anim;
        anim.onfinish = settle;
        anim.oncancel = settle;
        if (safetyRef.current) clearTimeout(safetyRef.current);
        safetyRef.current = setTimeout(settle, 1200);
      } catch {
        settle();
      }
    },
    [centerFor, commitSlide, settleFlight]
  );

  // Next / previous dish (positions 3 and 1 around the active slot 2).
  const goStep = useCallback(
    (dir) => {
      if (N < 2 || flyingRef.current) return;
      const to = (indexRef.current + dir + N) % N;
      slideTo(2 + dir, to);
    },
    [slideTo]
  );
  const goNext = useCallback(() => goStep(1), [goStep]);
  const goPrev = useCallback(() => goStep(-1), [goStep]);
  const goTo = useCallback(
    (dish) => {
      if (flyingRef.current) return;
      const pos = orderFor(indexRef.current).indexOf(dish);
      if (pos === 2) return;
      slideTo(pos, dish);
    },
    [slideTo]
  );

  // Autoplay: quick beat for images; the video slide plays through fully
  // and hands over on `ended`. Blocked ticks retry shortly so the loop
  // never stalls.
  useEffect(() => {
    if (N < 2 || DISHES[indexRef.current]?.type === "video") return undefined;
    const id = setTimeout(() => {
      if (pauseRef.current || document.hidden || flyingRef.current) {
        quickRef.current = true;
        setRetry((r) => r + 1);
        return;
      }
      quickRef.current = false;
      goNext();
    }, quickRef.current ? 1200 : AUTOPLAY_MS);
    return () => clearTimeout(id);
  }, [index, retry, goNext]);

  // Single persistent video element (never remounts, so no reload flash):
  // plays with voice when its slide is active, pauses + rewinds otherwise.
  // Falls back to muted when the browser blocks unmuted autoplay.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (DISHES[index]?.type === "video") {
        v.muted = muted;
        const pr = v.play();
        if (pr && typeof pr.catch === "function") {
          pr.catch(() => setMuted(true));
        }
      } else if (!v.paused) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch {
          // ignore — metadata may not be loaded yet
        }
      }
    } catch {
      setMuted(true);
    }
  }, [index, muted]);

  // Video stall guard: if the video never ends (hidden tab, buffering) the
  // normal timer is exempt, so without this the loop would trap forever.
  // Resumes a paused video when the tab returns; force-advances after 2 min.
  useEffect(() => {
    if (N < 2 || DISHES[indexRef.current]?.type !== "video") return undefined;
    const id = setTimeout(() => {
      if (!flyingRef.current) goNext();
    }, 120000);
    const onVis = () => {
      if (document.hidden) return;
      const v = videoRef.current;
      if (v && DISHES[indexRef.current]?.type === "video" && v.paused && !v.ended) {
        try {
          const pr = v.play();
          if (pr && typeof pr.catch === "function") pr.catch(() => {});
        } catch {
          // ignore — the 2-minute fallback still advances
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [index, goNext]);

  const setPause = (v) => {
    pauseRef.current = v;
  };

  return (
    <section className="dish-carousel" aria-label="Made fresh at home by our cooks">
      <div
        className="dish-stage"
        ref={stageRef}
        onMouseEnter={() => setPause(true)}
        onMouseLeave={() => setPause(false)}
        onFocus={() => setPause(true)}
        onBlur={() => setPause(false)}
        onTouchStart={(e) => {
          setPause(true);
          touchXRef.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          setPause(false);
          const startX = touchXRef.current;
          touchXRef.current = null;
          if (startX == null) return;
          const dx = startX - (e.changedTouches[0]?.clientX ?? startX);
          if (Math.abs(dx) > 40) {
            lastSwipeRef.current = Date.now();
            if (dx > 0) goNext();
            else goPrev();
          }
        }}
      >
        <div ref={filmRef} className="dish-film">
          {order.map((d) => {
            const isActive = d === index;
            const dish = DISHES[d];
            return (
              <div
                key={dish.name}
                className={`dish-frame${isActive ? " active" : ""}`}
                aria-hidden={!isActive || undefined}
                role={isActive ? undefined : "button"}
                tabIndex={isActive ? undefined : 0}
                aria-label={isActive ? undefined : `Show ${dish.name}`}
                onClick={() => {
                  if (Date.now() - lastSwipeRef.current < 500) return;
                  if (!isActive) goTo(d);
                }}
                onKeyDown={(e) => {
                  if (!isActive && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    goTo(d);
                  }
                }}
                style={isActive ? undefined : { cursor: "pointer" }}
              >
                {dish.type === "video" ? (
                  <video
                    ref={videoRef}
                    src={dish.src}
                    muted
                    loop={false}
                    playsInline
                    preload="auto"
                    aria-label={dish.alt}
                    onEnded={() => goNext()}
                  />
                ) : (
                  <img
                    src={dish.src}
                    alt={dish.alt}
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    onError={(e) => {
                      if (e.currentTarget.src !== FALLBACK_IMG) e.currentTarget.src = FALLBACK_IMG;
                    }}
                  />
                )}
                <span className="dish-card-tag">{dish.tag}</span>
                {dish.type === "video" && isActive && (
                  <button
                    type="button"
                    className="dish-mute-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMuted((m) => !m);
                    }}
                    aria-label={muted ? "Unmute video" : "Mute video"}
                    aria-pressed={!muted}
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="dish-stage-arrow left"
          onClick={goPrev}
          aria-label="Previous dish"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className="dish-stage-arrow right"
          onClick={goNext}
          aria-label="Next dish"
        >
          <ChevronRight size={18} />
        </button>
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
    </section>
  );
};

export default DishCarousel;
