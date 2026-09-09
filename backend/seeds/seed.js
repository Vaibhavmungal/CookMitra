const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("../models/User");
const CookProfile = require("../models/CookProfile");
const Availability = require("../models/Availability");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const Notification = require("../models/Notification");
const Coupon = require("../models/Coupon");

dotenv.config();

// Initial promo coupons — upto 20% off festive bookings. Used both by the
// full `npm run seed` and the safe `node seeds/seed.js --coupons-only` mode
// (which only inserts missing codes into an existing database, no wiping).
// validFrom/validTo are left null = active from now with no expiry.
const INITIAL_COUPONS = [
  {
    code: "BAPPA20",
    description: "Ganesh Utsav special — flat 20% off festive cook bookings.",
    percent: 20,
    maxDiscount: 500,
    minOrder: 0,
    perUserLimit: 1,
    active: true,
  },
  {
    code: "FESTIVE15",
    description: "15% off any festive cooking session this season.",
    percent: 15,
    maxDiscount: 400,
    minOrder: 0,
    perUserLimit: 1,
    active: true,
  },
  {
    code: "UTSAV10",
    description: "10% off on first festive cook booking.",
    percent: 10,
    maxDiscount: 300,
    minOrder: 0,
    perUserLimit: 1,
    active: true,
  },
  {
    code: "MORYA5",
    description: "5% early-bird festive offer.",
    percent: 5,
    maxDiscount: 200,
    minOrder: 0,
    perUserLimit: 1,
    active: true,
  },
];

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected for seeding");

    // DANGER: seeding wipes every collection. Refuse when the database
    // already holds real data unless --force is passed explicitly.
    const existingUsers = await User.countDocuments();
    if (existingUsers > 0 && !process.argv.includes("--force")) {
      console.error(
        `Refusing to seed: database "${mongoose.connection.name}" already has ${existingUsers} user(s). ` +
          `Seeding DELETES all users, cooks, bookings, reviews and notifications. ` +
          `Re-run with --force if you really want to wipe it: node seeds/seed.js --force`
      );
      await mongoose.disconnect();
      process.exit(1);
    }

    await User.deleteMany({});
    await CookProfile.deleteMany({});
    await Availability.deleteMany({});
    await Booking.deleteMany({});
    await Review.deleteMany({});
    await Notification.deleteMany({});
    await Coupon.deleteMany({});

    const admin = await User.create({
      name: "Admin",
      email: "admin@festivecook.com",
      phone: "9999999999",
      password: "admin123",
      role: "admin",
    });

    const customer = await User.create({
      name: "Neha Sharma",
      email: "neha@example.com",
      phone: "9876543210",
      password: "password123",
      role: "customer",
    });

    const cook1 = await User.create({
      name: "Priya Patil",
      email: "priya@example.com",
      phone: "9123456789",
      password: "password123",
      role: "cook",
    });

    const cook2 = await User.create({
      name: "Sunita Deshmukh",
      email: "sunita@example.com",
      phone: "9123456780",
      password: "password123",
      role: "cook",
    });

    console.log("Seed data created successfully!");
    console.log("Admin: admin@festivecook.com / admin123");
    console.log("Customer: neha@example.com / password123");
    console.log("Cook 1: priya@example.com / password123");
    console.log("Cook 2: sunita@example.com / password123");

    // Cook profiles: one approved (bookable), one pending (admin approval demo)
    await CookProfile.create({
      user: cook1._id,
      bio: "Experienced in Diwali Faral and traditional Maharashtrian sweets with 8 years of home cooking experience.",
      experienceYears: 8,
      specialties: ["Chakli", "Karanji", "Ladoo", "Modak"],
      serviceTypes: ["cook_for_me", "cook_with_me", "teach_me"],
      rate: 500,
      serviceArea: "Pune",
      approvalStatus: "approved",
    });

    await CookProfile.create({
      user: cook2._id,
      bio: "Specialist in fasting recipes and festive prasad.",
      experienceYears: 5,
      specialties: ["Sabudana Khichdi", "Modak"],
      serviceTypes: ["cook_with_me", "preparation_help"],
      rate: 400,
      serviceArea: "Mumbai",
      approvalStatus: "pending",
    });

    // Availability slots for the approved cook (next 7 days, 3 slots/day)
    const slots = [];
    for (let d = 1; d <= 7; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      date.setHours(0, 0, 0, 0);
      slots.push(
        { cook: cook1._id, date: new Date(date), startTime: "09:00", endTime: "11:00", status: "available" },
        { cook: cook1._id, date: new Date(date), startTime: "12:00", endTime: "14:00", status: "available" },
        { cook: cook1._id, date: new Date(date), startTime: "16:00", endTime: "18:00", status: "available" }
      );
    }
    await Availability.insertMany(slots);
    console.log(`Seeded 1 approved + 1 pending cook profile and ${slots.length} availability slots`);

    // Initial promo coupons — up to 20% off festive bookings. Admin-managed
    // from the admin dashboard (Coupons tab) at any time afterwards.
    await Coupon.create(INITIAL_COUPONS.map((c) => ({ ...c, createdBy: admin._id })));
    console.log("Seeded 4 promo coupons (up to 20% off): BAPPA20, FESTIVE15, UTSAV10, MORYA5");
    process.exit(0);
  } catch (error) {
    console.error("Seeding error:", error);
    process.exit(1);
  }
};

// Safe, non-destructive coupon seeding for an existing database: inserts only
// the initial up-to-20% coupons whose codes are missing. No data is wiped.
// Run: node seeds/seed.js --coupons-only
const seedCouponsOnly = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected for coupon seeding (--coupons-only)");
    const admin = await User.findOne({ role: "admin" }).select("_id");
    let created = 0;
    for (const t of INITIAL_COUPONS) {
      const existing = await Coupon.findOne({ code: t.code });
      if (existing) continue;
      await Coupon.create({ ...t, createdBy: admin?._id });
      created += 1;
    }
    console.log(
      `Coupon seeding done: ${created} created, ${INITIAL_COUPONS.length - created} already present.`
    );
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Coupon seeding error:", error);
    process.exit(1);
  }
};

if (process.argv.includes("--coupons-only")) {
  seedCouponsOnly();
} else {
  seedData();
}
