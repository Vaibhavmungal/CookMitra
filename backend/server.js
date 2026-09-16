const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");

dotenv.config();

const app = express();

// Behind reverse proxies (Render/Railway/Nginx/Heroku) so req.protocol/secure
// reflect the real client connection for HTTPS cookie/redirect logic.
app.set("trust proxy", 1);

// ---- Production config validation (warn loudly, never crash) ----
if (process.env.NODE_ENV === "production") {
  const jwt = process.env.JWT_SECRET || "";
  if (
    !jwt ||
    /^your_/i.test(jwt) ||
    /change_?me|example/i.test(jwt) ||
    jwt.length < 32
  ) {
    console.error(
      "CONFIG WARNING: JWT_SECRET is missing, a placeholder, or too short (<32 chars). Set a long random secret (e.g. `openssl rand -hex 32`) or all logins will be insecure/unstable."
    );
  }
  if (process.env.ALLOW_TEST_PAYMENTS === "true") {
    console.error(
      "CONFIG WARNING: ALLOW_TEST_PAYMENTS=true is set while NODE_ENV=production. Test-mode checkout is now force-disabled in code, but unset this var to remove confusion."
    );
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.warn(
      "CONFIG NOTICE: GOOGLE_CLIENT_ID is not set — email/password auth works, but Google sign-in will return 500 until configured."
    );
  }
  try {
    // Reuse the same placeholder detection as the payments route.
    const { isConfigured } = require("./config/razorpay");
    if (!isConfigured) {
      console.warn(
        "CONFIG NOTICE: Razorpay keys missing/placeholder — POST /api/payments/order will return 503 until real RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set."
      );
    }
  } catch {
    // non-fatal: payments route reports its own status
  }
  if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
    console.warn(
      "CONFIG NOTICE: RAZORPAY_WEBHOOK_SECRET is not set — POST /api/payments/webhook cannot verify signatures (browser payments still work, webhook reconcile is skipped)."
    );
  }
}

// Background retry loop — never throws, never exits. The API stays up
// (health reports db status) even while MongoDB is unreachable.
connectDB();

// A single stray async error must not kill the whole server. Log loudly,
// keep serving.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection (server kept alive):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server kept alive):", err);
});

// CORS: allow the deployed frontend origin (CLIENT_URL, comma-separated for
// multiple environments). In production the app is same-origin, so CORS only
// matters for separately hosted frontends.
const parseOrigins = (v) =>
  (v || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const corsOrigins = parseOrigins(process.env.CLIENT_URL);
const isProduction = process.env.NODE_ENV === "production";
app.use(
  cors({
    // In production with no CLIENT_URL set, default to same-origin only
    // (no cross-origin headers at all). In dev, allow everything.
    origin:
      !isProduction && corsOrigins.length === 0
        ? true
        : corsOrigins.length > 0
          ? corsOrigins
          : false,
    credentials: true,
  })
);
// Razorpay webhooks need the RAW request body for HMAC verification — mount
// before express.json() (body-parser skips bodies that are already parsed,
// so the JSON parser below leaves webhook requests untouched).
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(
  morgan(isProduction ? "combined" : "dev", {
    // Keep health-check noise out of production logs.
    skip: (req) => req.path === "/api/health" && isProduction,
  })
);

// Uploaded cook verification documents (Aadhaar / PAN / photo).
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/cooks", require("./routes/cooks"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/availability", require("./routes/availability"));
app.use("/api/reviews", require("./routes/reviews"));
app.use("/api/complaints", require("./routes/complaints"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/leads", require("./routes/leads"));
app.use("/api/coupons", require("./routes/coupons"));

app.get("/api/health", (req, res) => {
  const states = ["disconnected", "connected", "connecting", "disconnecting"];
  res.json({
    status: "ok",
    db: states[mongoose.connection.readyState] ?? "unknown",
    timestamp: new Date().toISOString(),
  });
});

// ---- Static frontend (single-service deployment) ----
// When a production build exists (frontend/build copied in, or built in a
// monorepo image), serve it from this process and fall back to index.html for
// client-side routes. API + /uploads routes above always win.
const frontendBuild = path.join(__dirname, "..", "frontend", "build");
if (fs.existsSync(path.join(frontendBuild, "index.html"))) {
  app.use(express.static(frontendBuild, { maxAge: "1y", index: false }));
  app.get("*", (req, res, next) => {
    if (/^\/(api|uploads)(\/|$)/.test(req.path)) {
      return next();
    }
    res.sendFile(path.join(frontendBuild, "index.html"));
  });
  console.log("Serving frontend build from", frontendBuild);
}

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
// A previous instance (or a nodemon restart race) can still hold the port
// for a moment. Retry instead of dying instantly — instant exit(1) here is
// what made the backend look like it "closes automatically".
const MAX_LISTEN_RETRIES = Number(process.env.PORT_RETRY_ATTEMPTS || 10);
const LISTEN_RETRY_MS = Number(process.env.PORT_RETRY_MS || 1000);
let listenRetries = 0;

const server = app.listen(PORT, () => {
  listenRetries = 0;
  console.log(`Server running on port ${PORT}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE" && listenRetries < MAX_LISTEN_RETRIES) {
    listenRetries += 1;
    console.warn(
      `Port ${PORT} busy (old instance still shutting down?) — retrying in ${LISTEN_RETRY_MS / 1000}s ` +
        `(attempt ${listenRetries}/${MAX_LISTEN_RETRIES})...`
    );
    setTimeout(() => server.listen(PORT), LISTEN_RETRY_MS);
    return;
  }
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is still in use after ${MAX_LISTEN_RETRIES} retries — another "node server.js" is probably still running. ` +
        `Run only ONE backend (npm run dev OR npm start, not both), or stop the other first (taskkill /F /IM node.exe).`
    );
    process.exit(1);
    return;
  }
  console.error("Server error:", err);
});

// Graceful shutdown — close the listener (frees the port immediately for the
// next instance) and the DB connection instead of dying mid-request.
const shutdown = (signal) => {
  console.log(`Received ${signal} — closing server gracefully...`);
  server.close(() => {
    mongoose.connection.close(false).finally(() => process.exit(0));
  });
  // Force-exit if keep-alive sockets hang the graceful close.
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));
