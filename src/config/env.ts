import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  MONGO_URI: z.string().min(1, "MONGO_URI is required"),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  FIREBASE_ENABLED: z.enum(["true", "false"]).default("false"),
  FIREBASE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  ENABLE_BULLMQ: z.enum(["true", "false"]).default("true"),
  SOCKET_REDIS_ADAPTER: z.enum(["true", "false"]).default("true"),
  CACHE_TTL_SECONDS: z.coerce.number().default(300),
  LIVE_LOCATION_TTL_SECONDS: z.coerce.number().default(7200),
  CORS_ORIGINS: z.string().default(""),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  JSON_BODY_LIMIT: z.string().default("2mb"),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().default(900_000),
  RATE_LIMIT_API_MAX: z.coerce.number().default(200),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().default(20),
  RATE_LIMIT_PAYMENT_MAX: z.coerce.number().default(30),
  FRONTEND_URL: z.string().url().default("http://localhost:8081"),
  MASTER_URL: z.string().url().default("http://localhost:5000"),
  API_URL: z.string().url().default("http://localhost:5000"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 chars"),
  JWT_ADMIN_ACCESS_SECRET: z
    .string()
    .min(16, "JWT_ADMIN_ACCESS_SECRET must be at least 16 chars"),
  JWT_ADMIN_REFRESH_SECRET: z
    .string()
    .min(16, "JWT_ADMIN_REFRESH_SECRET must be at least 16 chars"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  EMAIL_FROM: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_BUCKET_NAME: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  GOOGLE_MAPS_ANDROID_KEY: z.string().optional(),
  GOOGLE_MAPS_IOS_KEY: z.string().optional(),
  GOOGLE_GEOCODING_API_KEY: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GOOGLE_ROUTES_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
