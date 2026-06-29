import express from "express";

import compression from "compression";

import cors from "cors";

import helmet from "helmet";

import hpp from "hpp";

import cookieParser from "cookie-parser";

import morgan from "morgan";

import apiRoutes from "./routes/index.js";

import swaggerUi from "swagger-ui-express";

import { specs } from "./config/swagger.js";

import config from "./config/config.js";

import { getCorsOrigins, getHelmetOptions, shouldTrustProxy } from "./config/security.js";

import { errorHandler } from "./middlewares/error.middleware.js";

import { notFoundHandler } from "./middlewares/notFound.middleware.js";

import { apiRateLimiter } from "./middlewares/rateLimit.middleware.js";

import {

  mongoSanitizeMiddleware,

  xssSanitizeMiddleware,

} from "./middlewares/sanitize.middleware.js";

import { asyncHandler } from "./utils/asyncHandler.js";

import { paymentWebhook } from "./controllers/payments.controller.js";



const app: express.Express = express();



if (shouldTrustProxy()) {

  app.set("trust proxy", 1);

}



const corsOrigins = getCorsOrigins();

/** Capacitor / Expo native WebViews send these origins — must stay allowed in production */
const NATIVE_APP_ORIGINS = [
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
  "ionic://localhost",
];

function resolveCorsOrigin():
  | boolean
  | string[]
  | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  if (corsOrigins === true) return true;

  const defaults = [
    config.FRONTEND_URL,
    config.MASTER_URL,
    config.API_URL,
    "http://localhost:5174",
    "http://localhost:5175",
    ...NATIVE_APP_ORIGINS,
  ].filter(Boolean);

  const allowed = corsOrigins.length > 0
    ? [...new Set([...corsOrigins, ...NATIVE_APP_ORIGINS])]
    : defaults;

  return allowed;
}

app.use(

  cors({

    origin: resolveCorsOrigin(),

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],

  }),

);



app.use(helmet(getHelmetOptions()));

app.use(hpp());

// Compress all responses (Gzip) — reduces JSON payload sizes by 70-80%
// Skip compression for the Razorpay webhook which needs the raw Buffer body
app.use(
  compression({
    level: 6,          // Balanced: good compression ratio at low CPU cost
    threshold: 1024,   // Only compress responses > 1KB (skip tiny 200 OK acks)
    filter: (req, res) => {
      // Never compress SSE streams (socket.io long-poll or EventSource)
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
  }),
);



if (config.NODE_ENV !== "test") {

  app.use(morgan(config.NODE_ENV === "production" ? "combined" : "dev"));

}



// Razorpay webhook needs raw body for signature verification (before express.json)

app.post(

  "/api/v1/payments/webhook",

  express.raw({ type: "application/json" }),

  asyncHandler(paymentWebhook),

);



app.use(express.json({ limit: config.JSON_BODY_LIMIT }));

app.use(

  express.urlencoded({ limit: config.JSON_BODY_LIMIT, extended: true }),

);

app.use(cookieParser());



app.use(mongoSanitizeMiddleware);

app.use(xssSanitizeMiddleware);



app.use("/api/v1", apiRateLimiter, apiRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));



app.use(notFoundHandler);



app.use(errorHandler);



export default app;


