import "dotenv/config";
import connectDB from "../config/db.js";
import AdminUser from "../models/adminUser.model.js";
import { AdminRole } from "../types/enums.js";
import logger from "../config/logger.js";

const seedAdmin = async () => {
  await connectDB();

  const email = process.env.ADMIN_EMAIL || "admin@foodapp.com";
  const password = process.env.ADMIN_PASSWORD || "Admin@123";

  let admin = await AdminUser.findOne({ email });
  if (!admin) {
    admin = await AdminUser.create({
      email,
      password,
      name: "Super Admin",
      role: AdminRole.SUPER_ADMIN,
    });
    logger.info(`Admin seeded: ${email}`);
  } else {
    admin.password = password;
    admin.role = AdminRole.SUPER_ADMIN;
    admin.isActive = true;
    await admin.save();
    logger.info(`Admin updated: ${email}`);
  }

  process.exit(0);
};

seedAdmin();
