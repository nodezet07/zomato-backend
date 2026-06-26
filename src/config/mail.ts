import nodemailer from "nodemailer";
import config from "./config.js";
import logger from "./logger.js";

const SMTP_TIMEOUT_MS = 10_000;
const isProd = config.NODE_ENV === "production";

const hasResend = Boolean(config.RESEND_API_KEY);
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

function resolveFromAddress(): string {
  if (config.EMAIL_FROM) return config.EMAIL_FROM;
  if (hasResend) return "QBITES <onboarding@resend.dev>";
  return `"Food App" <${config.SMTP_USER}>`;
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!config.RESEND_API_KEY) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveFromAddress(),
        to: [to],
        subject,
        html,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error(`Resend failed to ${to}: ${res.status} ${body.slice(0, 200)}`);
      return false;
    }

    const data = (await res.json()) as { id?: string };
    logger.info(`Resend email sent to ${to}: ${data.id ?? "ok"}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Resend failed to ${to}: ${message}`);
    return false;
  }
}

async function sendViaSmtp(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!transporter) return false;

  try {
    const info = await transporter.sendMail({
      from: resolveFromAddress(),
      to,
      subject,
      html,
    });
    logger.info(`SMTP email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`SMTP email failed to ${to}: ${message}`);
    return false;
  }
}

/** Resend API first (works on Render), then Gmail SMTP fallback for local dev. */
export async function trySendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (hasResend) {
    const sent = await sendViaResend(to, subject, html);
    if (sent) return true;
  }

  if (transporter) {
    return sendViaSmtp(to, subject, html);
  }

  if (!isProd) {
    logger.warn(`[DEV] Email skipped (no Resend/SMTP): ${to} — ${subject}`);
  }
  return false;
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
 * Production: wait for email delivery (Resend or SMTP).
 * Development: respond immediately; email in background; devOtp if delivery fails.
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
