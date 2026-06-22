import "dotenv/config";
import { sendLoginOtpEmail } from "../src/config/mail.js";

const to = process.argv[2] || process.env.SMTP_USER;

if (!to) {
  console.error("Usage: npx tsx scripts/test-smtp.ts <email>");
  process.exit(1);
}

const otp = String(Math.floor(100000 + Math.random() * 900000));

sendLoginOtpEmail(to, otp)
  .then(() => {
    console.log(`✅ Test OTP email sent to ${to} (OTP: ${otp})`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ SMTP failed:", err.message ?? err);
    process.exit(1);
  });
