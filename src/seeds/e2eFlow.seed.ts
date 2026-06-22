/**
 * E2E flow seed — demo users with known passwords for full journey testing.
 *
 * Run after phase2: npm run seed:phase2 && npm run seed:e2e
 *
 * Credentials (password for all: Test@123456):
 *   owner@foodapp.com   — restaurant owner (Demo Biryani House)
 *   rider@foodapp.com   — approved rider
 *   customer@foodapp.com — sample customer (optional login)
 */
import "dotenv/config";
import connectDB from "../config/db.js";
import logger from "../config/logger.js";
import User from "../models/user.model.js";
import Restaurant from "../models/restaurant.model.js";
import Rider from "../models/rider.model.js";
import {
  AccountStatus,
  RestaurantStatus,
  UserRole,
  VerificationStatus,
  VehicleType,
} from "../types/enums.js";
import { generateRiderCode } from "../services/rider.service.js";

const DEMO_PASSWORD = process.env.E2E_PASSWORD || "Test@123456";

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
    logger.info(`Created user ${opts.email}`);
    return user;
  }
  user.password = DEMO_PASSWORD;
  user.role = opts.role;
  user.accountStatus = AccountStatus.ACTIVE;
  user.isEmailVerified = true;
  await user.save();
  logger.info(`Updated user ${opts.email}`);
  return user;
}

async function seedE2eFlow() {
  await connectDB();

  const owner = await upsertUser({
    email: "owner@foodapp.com",
    fullName: "Demo Restaurant Owner",
    mobile: "9876543210",
    role: UserRole.RESTAURANT_OWNER,
  });

  const restaurant = await Restaurant.findOne({ slug: "demo-biryani-house" });
  if (restaurant) {
    restaurant.ownerId = owner._id;
    restaurant.restaurantStatus = RestaurantStatus.APPROVED;
    restaurant.isOpen = true;
    await restaurant.save();
    logger.info("Demo Biryani House — approved & open");
  } else {
    logger.warn("Run npm run seed:phase2 first — demo restaurant not found");
  }

  const riderUser = await upsertUser({
    email: "rider@foodapp.com",
    fullName: "Demo Rider",
    mobile: "9876543211",
    role: UserRole.RIDER,
  });

  let rider = await Rider.findOne({ userId: riderUser._id });
  if (!rider) {
    rider = await Rider.create({
      userId: riderUser._id,
      riderCode: generateRiderCode(),
      vehicleType: VehicleType.BIKE,
      vehicleNumber: "MH01AB1234",
      verificationStatus: VerificationStatus.APPROVED,
      onlineStatus: false,
    });
    logger.info(`Created rider ${rider.riderCode}`);
  } else {
    rider.verificationStatus = VerificationStatus.APPROVED;
    await rider.save();
    logger.info(`Rider ${rider.riderCode} — approved`);
  }

  await upsertUser({
    email: "customer@foodapp.com",
    fullName: "Demo Customer",
    mobile: "9876543212",
    role: UserRole.CUSTOMER,
  });

  logger.info("E2E flow seed completed");
  logger.info(`  Owner:    owner@foodapp.com / ${DEMO_PASSWORD}`);
  logger.info(`  Rider:    rider@foodapp.com / ${DEMO_PASSWORD}`);
  logger.info(`  Customer: customer@foodapp.com / ${DEMO_PASSWORD}`);
  process.exit(0);
}

seedE2eFlow().catch((err) => {
  logger.error(err);
  process.exit(1);
});
