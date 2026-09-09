const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { auth, authorize } = require("../middleware/auth");
const { createOrder, verifyPayment, handleWebhook } = require("../controllers/paymentController");

router.post(
  "/order",
  auth,
  authorize("customer"),
  [
    body("cook").notEmpty().withMessage("Cook is required"),
    body("date").isISO8601().withMessage("Valid date is required"),
    body("startTime").notEmpty().withMessage("Start time is required"),
    body("endTime").notEmpty().withMessage("End time is required"),
    body("durationHours")
      .optional()
      .isFloat({ min: 0.5, max: 12 })
      .withMessage("Duration must be between 0.5 and 12 hours"),
    body("bookingId")
      .optional()
      .isMongoId()
      .withMessage("Valid booking id is required"),
  ],
  validate,
  createOrder
);

router.post(
  "/verify",
  auth,
  authorize("customer"),
  [
    body("razorpay_order_id").notEmpty().withMessage("Order id is required"),
    body("razorpay_payment_id").notEmpty().withMessage("Payment id is required"),
    body("razorpay_signature").notEmpty().withMessage("Signature is required"),
  ],
  validate,
  verifyPayment
);

// Razorpay event webhook — deliberately NO auth/validation middleware:
// Razorpay signs the RAW body (server.js mounts express.raw() for this path
// before express.json()) and the handler verifies the HMAC itself.
router.post("/webhook", handleWebhook);

module.exports = router;
