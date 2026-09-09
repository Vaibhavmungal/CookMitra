
const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { auth, authorize } = require("../middleware/auth");
const {
  createBooking,
  getMyBookings,
  getMyLocations,
  getCookBookings,
  getAdminBookings,
  getBookingById,
  getBookingLiveTracking,
  acceptBooking,
  rejectBooking,
  completeBooking,
  cancelBooking,
  payBooking,
  shareCookLocation,
  markCookArrived,
} = require("../controllers/bookingController");

router.post(
  "/",
  auth,
  authorize("customer"),
  [
    body("cook").notEmpty().withMessage("Cook is required"),
    body("serviceType")
      .isIn(["cook_for_me", "cook_with_me", "teach_me", "preparation_help"])
      .withMessage("Valid service type is required"),
    body("date").isISO8601().withMessage("Valid date is required"),
    body("startTime").notEmpty().withMessage("Start time is required"),
    body("endTime").notEmpty().withMessage("End time is required"),
    body("address").trim().notEmpty().withMessage("Address is required"),
    body("guests")
      .optional()
      .isInt({ min: 1, max: 500 })
      .withMessage("Guests must be between 1 and 500"),
    body("durationHours")
      .optional()
      .isFloat({ min: 0.5, max: 12 })
      .withMessage("Duration must be between 0.5 and 12 hours"),
    body("location.lat")
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage("Invalid latitude"),
    body("location.lng")
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage("Invalid longitude"),
    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be a non-negative number"),
    // Payment details are optional now (pay-on-booking removed): when absent
    // the booking is created with payment.status "pending".
  ],
  validate,
  createBooking
);

router.get("/my", auth, authorize("customer"), getMyBookings);
router.get("/my/locations", auth, authorize("customer"), getMyLocations);
router.get("/cook", auth, authorize("cook"), getCookBookings);
router.get("/:id/live", auth, getBookingLiveTracking);
router.get("/:id", auth, getBookingById);
router.get("/", auth, authorize("admin"), getAdminBookings);
router.patch("/:id/accept", auth, authorize("cook", "admin"), acceptBooking);
// Customer confirms payment within the 5-minute post-acceptance window.
router.patch("/:id/pay", auth, authorize("customer"), payBooking);
router.patch("/:id/reject", auth, authorize("cook", "admin"), rejectBooking);
router.patch("/:id/complete", auth, authorize("cook", "admin"), completeBooking);
router.patch(
  "/:id/cook-location",
  auth,
  authorize("cook", "admin"),
  [
    body("lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("accuracy").optional().isFloat({ min: 0, max: 100000 }).withMessage("Invalid accuracy"),
  ],
  validate,
  shareCookLocation
);
router.patch("/:id/arrived", auth, authorize("cook", "admin"), markCookArrived);
router.patch("/:id/cancel", auth, cancelBooking);

module.exports = router;
