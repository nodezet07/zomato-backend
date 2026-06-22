/**
 * Team accounts for real Gmail OTP testing.
 *
 *   shaikhanzal94@gmail.com   — restaurant owner (Demo Biryani House)
 *   enganzalshaikh@gmail.com  — customer
 *   antigravityfree70@gmail.com — rider
 *   samiyashk26@gmail.com     — admin panel
 *
 * App password: Test@123456  |  Admin: Admin@123
 */
import "dotenv/config";
import connectDB from "../config/db.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js";
import AdminUser from "../models/adminUser.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import {
  AccountStatus,
  AdminRole,
  RestaurantStatus,
  UserRole,
  VerificationStatus,
  VehicleType,
} from "../types/enums.js";
import { generateRiderCode } from "../services/rider.service.js";

const DEMO_PASSWORD = process.env.E2E_PASSWORD || "Test@123456";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";

const OWNER_EMAIL = process.env.TEAM_OWNER_EMAIL || "shaikhanzal94@gmail.com";
const CUSTOMER_EMAIL = process.env.TEAM_CUSTOMER_EMAIL || "enganzalshaikh@gmail.com";
const RIDER_EMAIL = process.env.TEAM_RIDER_EMAIL || "antigravityfree70@gmail.com";
const ADMIN_EMAIL = process.env.TEAM_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "samiyashk26@gmail.com";

async function upsertUser(opts: {
  email: string;
  fullName: string;
  mobile: string;
  role: UserRole;
}) {
  let user = await User.findOne({ email: opts.email });
  if (!user) {
    user = await User.create({
      ...opts,
      password: DEMO_PASSWORD,
      accountStatus: AccountStatus.ACTIVE,
      isEmailVerified: true,
    });
    logger.info(`Created user ${opts.email} (${opts.role})`);
    return user;
  }
  user.fullName = opts.fullName;
  user.mobile = opts.mobile;
  user.role = opts.role;
  user.password = DEMO_PASSWORD;
  user.accountStatus = AccountStatus.ACTIVE;
  user.isEmailVerified = true;
  await user.save();
  logger.info(`Updated user ${opts.email} (${opts.role})`);
  return user;
}

async function upsertAdmin() {
  let admin = await AdminUser.findOne({ email: ADMIN_EMAIL });
  if (!admin) {
    admin = await AdminUser.create({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      name: "Team Admin",
      role: AdminRole.SUPER_ADMIN,
    });
    logger.info(`Created admin ${ADMIN_EMAIL}`);
    return;
  }
  admin.password = ADMIN_PASSWORD;
  admin.name = "Team Admin";
  admin.role = AdminRole.SUPER_ADMIN;
  admin.isActive = true;
  await admin.save();
  logger.info(`Updated admin ${ADMIN_EMAIL}`);
}

async function seedTeamUsers() {
  await connectDB();

  const owner = await upsertUser({
    email: OWNER_EMAIL,
    fullName: "Anzal Restaurant Owner",
    mobile: "9876500001",
    role: UserRole.RESTAURANT_OWNER,
  });

  const restaurant =
    (await Restaurant.findOne({ slug: "demo-biryani-house" })) ??
    (await Restaurant.findOne({ restaurantName: /biryani/i }));

  if (restaurant) {
    restaurant.ownerId = owner._id;
    restaurant.restaurantStatus = RestaurantStatus.APPROVED;
    restaurant.isOpen = true;
    await restaurant.save();
    logger.info(`Linked ${OWNER_EMAIL} → ${restaurant.restaurantName}`);
  } else {
    logger.warn("No demo restaurant found — run seed:phase2 && seed:demo first");
  }

  await upsertUser({
    email: CUSTOMER_EMAIL,
    fullName: "Eng Anzal Customer",
    mobile: "9876500002",
    role: UserRole.CUSTOMER,
  });

  const riderUser = await upsertUser({
    email: RIDER_EMAIL,
    fullName: "Antigravity Rider",
    mobile: "9876500003",
    role: UserRole.RIDER,
  });

  let rider = await Rider.findOne({ userId: riderUser._id });
  if (!rider) {
    rider = await Rider.create({
      userId: riderUser._id,
      riderCode: generateRiderCode(),
      vehicleType: VehicleType.BIKE,
      vehicleNumber: "MH12TEAM01",
      verificationStatus: VerificationStatus.APPROVED,
      onlineStatus: false,
    });
    logger.info(`Created rider ${rider.riderCode}`);
  } else {
    rider.verificationStatus = VerificationStatus.APPROVED;
    await rider.save();
    logger.info(`Rider ${rider.riderCode} approved`);
  }

  await upsertAdmin();

  logger.info("── Team credentials ──");
  logger.info(`  Restaurant owner: ${OWNER_EMAIL}  (OTP to Gmail, password ${DEMO_PASSWORD})`);
  logger.info(`  Customer:         ${CUSTOMER_EMAIL}  / ${DEMO_PASSWORD}`);
  logger.info(`  Rider:            ${RIDER_EMAIL}  / ${DEMO_PASSWORD}`);
  logger.info(`  Admin panel:      ${ADMIN_EMAIL}  / ${ADMIN_PASSWORD}`);
  process.exit(0);
}

seedTeamUsers().catch((err) => {
  logger.error(err);
  process.exit(1);
});
