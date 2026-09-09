const express = require("express");
const router = express.Router();
const { auth, authorize } = require("../middleware/auth");
const {
  validateCoupon,
  listActiveCoupons,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require("../controllers/couponController");

// Public — promo codes are meant to be shared. The homepage billboard renders
// whatever comes back here, so admin-created offers go live immediately.
router.get("/active", listActiveCoupons);

// Customer — preview a coupon against a live order amount (never mutates usage).
router.post("/validate", auth, authorize("customer"), validateCoupon);

// Admin — full management (list / create / edit / delete).
router.get("/", auth, authorize("admin"), listCoupons);
router.post("/", auth, authorize("admin"), createCoupon);
router.patch("/:id", auth, authorize("admin"), updateCoupon);
router.delete("/:id", auth, authorize("admin"), deleteCoupon);

module.exports = router;