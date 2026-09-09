import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Resets scroll to the top on every route navigation (path or query change)
// so each page opened via a link/button starts at the top.
const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search]);

  return null;
};

export default ScrollToTop;
