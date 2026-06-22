import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction): void => {
    const data =
      source === "query" ? req.query : source === "params" ? req.params : req.body;
    const result = schema.safeParse(data);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(", ");
      res.status(400).json({ success: false, message });
      return;
    }
    if (source === "query") {
      Object.assign(req.query, result.data);
    } else if (source === "params") {
      Object.assign(req.params, result.data);
    } else {
      req.body = result.data;
    }
    next();
  };
