import nodemailer from "nodemailer";
import config from "./config.js";
import logger from "./logger.js";

const hasSmtp =
  config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS;

const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: Number(config.SMTP_PORT || 587),
      secure: config.SMTP_SECURE === "true",
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    })
  : null;

async function sendEmail(to: string, subject: string, html: string) {
  if (!transporter) {
    logger.warn(`[DEV] Email not sent (no SMTP): ${to} — ${subject}`);
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: config.EMAIL_FROM || `"Food App" <${config.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Email failed to ${to}: ${message}`);
    if (process.env.NODE_ENV !== "development") {
      throw error;
    }
    logger.warn(`[DEV] Continuing without email — OTP is in API response / server logs`);
  }
}

export const sendSignupOtpEmail = async (to: string, otp: string) => {
  const html = `
    <h2>Welcome to Food App</h2>
    <p>Your signup OTP is: <strong>${otp}</strong></p>
    <p>Valid for 10 minutes.</p>
  `;
  await sendEmail(to, "Your Food App Signup OTP", html);
};

export const sendLoginOtpEmail = async (to: string, otp: string) => {
  const html = `
    <h2>Food App Login</h2>
    <p>Your login OTP is: <strong>${otp}</strong></p>
    <p>Valid for 10 minutes.</p>
  `;
  await sendEmail(to, "Your Food App Login OTP", html);
};

export const sendTransactionalEmail = async (
  to: string,
  subject: string,
  html: string,
) => {
  await sendEmail(to, subject, html);
};

export const sendResetPasswordOtpEmail = async (to: string, otp: string) => {
  const html = `
    <h2>Reset your password</h2>
    <p>Your reset OTP is: <strong>${otp}</strong></p>
    <p>Valid for 10 minutes. If you did not request this, ignore this email.</p>
  `;
  await sendEmail(to, "Food App — Password Reset OTP", html);
};
