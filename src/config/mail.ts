import nodemailer from "nodemailer";
import config from "./config.js";
import logger from "./logger.js";

const SMTP_TIMEOUT_MS = 10_000;
const isProd = config.NODE_ENV === "production";

const hasSmtp =
  config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS;

const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: Number(config.SMTP_PORT || 587),
      secure: config.SMTP_SECURE === "true",
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    })
  : null;

/** Returns true when the message was handed off to SMTP successfully. */
export async function trySendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!transporter) {
    if (!isProd) {
      logger.warn(`[DEV] Email skipped (SMTP not configured): ${to} — ${subject}`);
    }
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: config.EMAIL_FROM || `"Food App" <${config.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Email failed to ${to}: ${message}`);
    return false;
  }
}

export const sendSignupOtpEmail = async (to: string, otp: string) => {
  const html = `
    <h2>Welcome to Food App</h2>
    <p>Your signup OTP is: <strong>${otp}</strong></p>
    <p>Valid for 10 minutes.</p>
  `;
  return trySendEmail(to, "Your Food App Signup OTP", html);
};

export const sendLoginOtpEmail = async (to: string, otp: string) => {
  const html = `
    <h2>Food App Login</h2>
    <p>Your login OTP is: <strong>${otp}</strong></p>
    <p>Valid for 10 minutes.</p>
  `;
  return trySendEmail(to, "Your Food App Login OTP", html);
};

export const sendTransactionalEmail = async (
  to: string,
  subject: string,
  html: string,
) => {
  const ok = await trySendEmail(to, subject, html);
  if (!ok) throw new Error(`Failed to send email to ${to}`);
};

export const sendResetPasswordOtpEmail = async (to: string, otp: string) => {
  const html = `
    <h2>Reset your password</h2>
    <p>Your reset OTP is: <strong>${otp}</strong></p>
    <p>Valid for 10 minutes. If you did not request this, ignore this email.</p>
  `;
  return trySendEmail(to, "Food App — Password Reset OTP", html);
};

/**
 * Production: wait up to SMTP_TIMEOUT_MS for delivery (fail if SMTP down).
 * Development: respond immediately; email sends in background; OTP only in API/logs if email fails.
 */
export async function deliverOtpEmail(
  email: string,
  otp: string,
  send: (to: string, code: string) => Promise<boolean>,
): Promise<boolean> {
  if (isProd) {
    return send(email, otp);
  }

  void send(email, otp).then((sent) => {
    if (!sent) {
      logger.warn(
        `[DEV] Email not delivered to ${email} — use devOtp in API response`,
      );
      logger.info(`[DEV] OTP for ${email}: ${otp}`);
    }
  });

  return true;
}
