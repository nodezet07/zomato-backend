import express from "express";

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

app.use(

  cors({

    origin:

      corsOrigins === true

        ? true

        : corsOrigins.length > 0

          ? corsOrigins

          : [
              config.FRONTEND_URL,
              config.MASTER_URL,
              config.API_URL,
              "http://localhost:5174",
              "http://localhost:5175",
            ].filter(Boolean),

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization"],

  }),

);



app.use(helmet(getHelmetOptions()));

app.use(hpp());



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


