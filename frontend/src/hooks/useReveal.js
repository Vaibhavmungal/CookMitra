import { useEffect, useRef, useState } from "react";

// useReveal — IntersectionObserver-driven scroll reveal.
// Returns [ref, visible]. Adds stagger via `delay` style var.
export const useReveal = ({ threshold = 0.15, rootMargin = "0px 0px -40px 0px" } = {}) => {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        });
      },
      { threshold, rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return [ref, visible];
};

export default useReveal;
