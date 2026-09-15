import React from "react";
import useReveal from "../hooks/useReveal";

// Reveal — scroll-triggered entrance wrapper.
// <Reveal delay={0.1} y={24} className="...">...</Reveal>
const Reveal = ({ children, delay = 0, y = 26, className = "", as: Tag = "div", ...rest }) => {
  const [ref, visible] = useReveal();
  return (
    <Tag
      ref={ref}
      className={`reveal ${visible ? "is-visible" : ""} ${className}`}
      style={{ transitionDelay: `${delay}s`, ["--reveal-y"]: `${y}px`, ...rest.style }}
      {...rest}
    >
      {children}
    </Tag>
  );
};

export default Reveal;
