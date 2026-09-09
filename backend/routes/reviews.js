const express = require("express");
const router = express.Router();
const { body } = require("express-validator");
const validate = require("../middleware/validate");
const { auth, authorize } = require("../middleware/auth");
const {
  createReview,
  getCookReviews,
  getMyReviews,
  getCookOwnReviews,
} = require("../controllers/reviewController");

router.post(
  "/",
  auth,
  authorize("customer"),
  [
    body("booking").notEmpty().withMessage("Booking is required"),
    body("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
  ],
  validate,
  createReview
);

router.get("/cook/:cookId", getCookReviews);
router.get("/my", auth, authorize("customer"), getMyReviews);
router.get("/cook-me", auth, authorize("cook"), getCookOwnReviews);

module.exports = router;
