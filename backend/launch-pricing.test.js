// Launch pricing + coupon math (pure functions, no DB).
// Run:  node backend/launch-pricing.test.js  — exits non-zero on failure.

const {
  LAUNCH_SLABS,
  COMMISSION_RATE,
  isSlabDuration,
  slabPriceForDuration,
  splitPayout,
} = require("./utils/pricing");
const {
  normalizeCode,
  rejectionReason,
  computeDiscount,
} = require("./utils/coupons");

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
  if (!ok) failures++;
};

// ── Launch slabs ────────────────────────────────────────────────────────────
check("slab table matches launch prices", JSON.stringify(LAUNCH_SLABS) === JSON.stringify({ 1: 199, 2: 349, 3: 499, 4: 649 }));
check("3h costs 499", slabPriceForDuration(3) === 499);
check("5h has no slab", slabPriceForDuration(5) === null);
check("halves have no slab", slabPriceForDuration(1.5) === null);
check("isSlabDuration guards", isSlabDuration(4) === true && isSlabDuration(0) === false);
check("commission is ~10%", COMMISSION_RATE === 0.1);
const split = splitPayout(449);
check("449 splits 45/404", split.commission === 45 && split.cookPayout === 404, JSON.stringify(split));

// ── Flat coupons ────────────────────────────────────────────────────────────
const flat50 = { discountType: "flat", flatAmount: 50, minOrder: 399 };
check("flat 50 off 499", computeDiscount(flat50, 499) === 50);
check("flat never exceeds order", computeDiscount({ discountType: "flat", flatAmount: 500 }, 199) === 199);
check("percent still works", computeDiscount({ discountType: "percent", percent: 20, maxDiscount: 500 }, 1000) === 200);
check("legacy coupon without type stays percent", computeDiscount({ percent: 10 }, 500) === 50);

// ── Eligibility ─────────────────────────────────────────────────────────────
check("unknown code rejected", rejectionReason(null, { amount: 499 }) === "This coupon is not valid for this booking.");
check("min order enforced", rejectionReason(flat50, { amount: 199 }) === "This coupon needs a minimum order of ₹399.");
check("min order passes", rejectionReason(flat50, { amount: 499 }) === null);
const usedOnce = { ...flat50, perUserLimit: 1, usedBy: ["u1"] };
check("reuse blocked", rejectionReason(usedOnce, { amount: 499, userId: "u1" }) === "You have already used this coupon.");
check("other user allowed", rejectionReason(usedOnce, { amount: 499, userId: "u2" }) === null);
const firstOnly = { ...flat50, firstBookingOnly: true, perUserLimit: null, usedBy: [] };
check("repeat customer blocked from first-booking coupon", rejectionReason(firstOnly, { amount: 499, userId: "u9", isFirstBooking: false }) === "This coupon is only for your first booking.");
check("new customer passes first-booking coupon", rejectionReason(firstOnly, { amount: 499, userId: "u9", isFirstBooking: true }) === null);
const scoped = { ...flat50, perUserLimit: null, usedBy: [], applicableServices: ["teach_me"] };
check("wrong service rejected", rejectionReason(scoped, { amount: 499, serviceType: "cook_for_me" }) === "This coupon is not valid for the selected service.");
check("right service passes", rejectionReason(scoped, { amount: 499, serviceType: "teach_me" }) === null);
check("code normalized", normalizeCode(" welcome50 ") === "WELCOME50");

console.log(failures === 0 ? "ALL TESTS PASSED" : failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
