import { v2 as cloudinary } from "cloudinary";
import logger from "./logger.js";

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

export function isCloudinaryEnabled(): boolean {
  return Boolean(cloudName && apiKey && apiSecret);
}

if (isCloudinaryEnabled()) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export async function uploadImageBuffer(
  buffer: Buffer,
  folder: string,
  mimetype: string,
): Promise<string | null> {
  if (!isCloudinaryEnabled()) {
    logger.warn("[Cloudinary] Not configured — set CLOUDINARY_* env vars");
    return null;
  }

  return new Promise((resolve) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        format: mimetype.includes("png") ? "png" : "jpg",
      },
      (err, result) => {
        if (err || !result?.secure_url) {
          logger.error(`[Cloudinary] Upload failed: ${err?.message ?? "unknown"}`);
          resolve(null);
          return;
        }
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
