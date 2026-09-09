const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { auth, authorize, optionalAuth } = require("../middleware/auth");
const { cookDocUpload } = require("../middleware/upload");
const {
  getCooks,
  getCook,
  getCookAdminOverview,
  getMyProfile,
  createCookProfile,
  updateCookProfile,
  updateMyLiveLocation,
  updateApprovalStatus,
  getAvailableSlots,
  uploadCookDocs,
  toggleAvailability,
} = require("../controllers/cookController");

router.get("/", optionalAuth, getCooks);
router.get("/me", auth, authorize("cook"), getMyProfile);
// Cook ID verification file uploads (Aadhaar / PAN / photo).
// Must be declared before "/:id" routes so "upload-docs" isn't treated as an id.
router.post(
  "/upload-docs",
  auth,
  authorize("cook"),
  (req, res, next) => {
    cookDocUpload.fields([
      { name: "aadhar", maxCount: 1 },
      { name: "pan", maxCount: 1 },
      { name: "photo", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || "File upload failed" });
      }
      next();
    });
  },
  uploadCookDocs
);
router.patch(
  "/me/location",
  auth,
  authorize("cook"),
  [
    body("lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("accuracy").optional().isFloat({ min: 0, max: 100000 }).withMessage("Invalid accuracy"),
  ],
  validate,
  updateMyLiveLocation
);
router.get("/admin-overview/:id", auth, authorize("admin"), getCookAdminOverview);
router.get("/:id", getCook);

router.post(
  "/",
  auth,
  authorize("cook"),
  [
    body("bio").optional().trim(),
    body("rate").isNumeric().withMessage("Rate must be a number"),
    body("serviceTypes")
      .isArray({ min: 1 })
      .withMessage("At least one service type is required"),
  ],
  validate,
  createCookProfile
);

router.put("/:id", auth, authorize("cook"), updateCookProfile);
router.patch(
  "/:id/approval",
  auth,
  authorize("admin"),
  [
    body("status")
      .isIn(["approved", "rejected"])
      .withMessage("Status must be approved or rejected"),
  ],
  validate,
  updateApprovalStatus
);

// Cook on/off switch — toggle between available / unavailable.
router.patch(
  "/me/availability",
  auth,
  authorize("cook"),
  [
    body("status")
      .isIn(["available", "unavailable"])
      .withMessage("Status must be available or unavailable"),
  ],
  validate,
  toggleAvailability
);

router.get("/:id/availability", getAvailableSlots);

module.exports = router;
