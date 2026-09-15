const jwt = require("jsonwebtoken");

const auth = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Re-check the account on every authenticated request so admin
    // block/delete actions take effect immediately — even for tokens
    // issued before the account was blocked or removed.
    const User = require("../models/User");
    const account = await User.findById(decoded.id).select("role status");

    if (!account) {
      return res
        .status(401)
        .json({ message: "Account no longer exists. Please log in again." });
    }
    if (account.status === "suspended") {
      return res.status(403).json({
        message:
          "Your account has been blocked by an administrator. Please contact support.",
      });
    }

    // Keep the { id, role } shape controllers rely on, plus the live status.
    req.user = { id: account._id.toString(), role: account.role, status: account.status };
    next();
  } catch (error) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

const optionalAuth = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Same live-account check as `auth`: a suspended/deleted account's stale
    // token must not keep its role (e.g. a blocked admin still seeing the
    // unfiltered cook list). On failure, continue as anonymous.
    try {
      const User = require("../models/User");
      const account = await User.findById(decoded.id).select("role status");
      if (!account || account.status === "suspended") {
        return next();
      }
      req.user = {
        id: account._id.toString(),
        role: account.role,
        status: account.status,
      };
    } catch {
      req.user = decoded;
    }
  } catch (error) {
    // Invalid token on public route: continue as anonymous
  }
  next();
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized for this action" });
    }
    next();
  };
};

module.exports = { auth, authorize, optionalAuth };
