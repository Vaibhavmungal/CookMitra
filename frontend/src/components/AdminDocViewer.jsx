import React, { useState, useEffect } from "react";
import { FileText, X, ExternalLink } from "lucide-react";
import { resolveFileUrl } from "./CookDocUploads";

export const isPdfUrl = (url) => /\.pdf(\?|#|$)/i.test(url || "");

// Image thumbnail that degrades to a file icon when the stored file is
// missing (e.g. uploads wiped) instead of showing a broken-image icon.
const ThumbImg = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <span className="admin-doc-pdf">
        <FileText size={26} />
        <span>FILE</span>
      </span>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
};

// Inline verification-document viewer for admins.
// docs: [{ label, url }] — image thumbs open in a lightbox, PDFs preview
// in an embedded frame. Missing docs render as "Not uploaded".
const AdminDocViewer = ({ docs }) => {
  const [active, setActive] = useState(null);
  const items = (docs || []).filter((d) => d?.url);

  useEffect(() => {
    if (active === null) return;
    const onKey = (e) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active]);

  const missing = (docs || []).filter((d) => !d?.url);

  return (
    <>
      <div className="admin-doc-grid">
        {items.map((d, i) => {
          const full = resolveFileUrl(d.url);
          const pdf = isPdfUrl(d.url);
          return (
            <button
              key={i}
              type="button"
              className="admin-doc-thumb"
              onClick={() => setActive(items.indexOf(d))}
              title={`View ${d.label}`}
            >
              {pdf ? (
                <span className="admin-doc-pdf">
                  <FileText size={26} />
                  <span>PDF</span>
                </span>
              ) : (
                <ThumbImg src={full} alt={d.label} />
              )}
              <span className="admin-doc-label">{d.label}</span>
            </button>
          );
        })}
        {missing.map((d, i) => (
          <span key={`m-${i}`} className="admin-doc-missing">
            {d.label}: not uploaded
          </span>
        ))}
      </div>

      {active !== null && items[active] && (
        <div className="admin-doc-lightbox" onClick={() => setActive(null)}>
          <div className="admin-doc-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <div className="admin-doc-lightbox-bar">
              <strong>{items[active].label}</strong>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <a
                  href={resolveFileUrl(items[active].url)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-outline btn-sm"
                >
                  <ExternalLink size={14} /> Open original
                </a>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setActive(null)}>
                  <X size={14} /> Close
                </button>
              </div>
            </div>
            {isPdfUrl(items[active].url) ? (
              <iframe src={resolveFileUrl(items[active].url)} title={items[active].label} />
            ) : (
              <img src={resolveFileUrl(items[active].url)} alt={items[active].label} />
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default AdminDocViewer;
