import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const S3_BUCKET = "mtgartistconnection";
const AWS_REGION = process.env.AWS_REGION || "us-west-1";
const CDN_BASE_URL = process.env.CDN_BASE_URL || "https://d25ut0vhqgdazl.cloudfront.net";

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export interface UploadResponse {
  imageUrl: string;
  key: string;
}

/**
 * Upload an image to S3 from a base64 string
 * This uploads server-side to avoid CORS issues with presigned URLs
 */
export const uploadImageFromBase64 = async (
  base64Data: string,
  filename: string,
  contentType: string
): Promise<UploadResponse> => {
  // Only raster images: anything else (e.g. text/html, image/svg+xml) served
  // from the CDN could run script in a visitor's browser.
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) {
    throw new Error("Unsupported image type. Use PNG, JPEG, WebP or GIF.");
  }

  // Remove data URL prefix if present (e.g., "data:image/png;base64,")
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Content, "base64");

  // Generate a unique key for the image; the extension comes from the
  // validated content type, never from the client-supplied filename
  const key = `news-images/${uuidv4()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  });

  await s3Client.send(command);

  // The final public URL where the image will be accessible
  const imageUrl = `${CDN_BASE_URL}/${key}`;

  return {
    imageUrl,
    key,
  };
};

/**
 * Delete an image from S3 (for cleanup if article is deleted)
 */
export const deleteImage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Extract key from URL
    const url = new URL(imageUrl);
    const key = url.pathname.substring(1); // Remove leading slash

    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error("Failed to delete image from S3:", error);
    return false;
  }
};
