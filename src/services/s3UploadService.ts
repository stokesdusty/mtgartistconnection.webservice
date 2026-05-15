import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

const NEWS_IMAGES_BUCKET = process.env.NEWS_IMAGES_BUCKET || "mtgartistconnection-news-images";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface PresignedUrlResponse {
  uploadUrl: string;
  imageUrl: string;
  key: string;
}

/**
 * Generate a presigned URL for uploading an image directly to S3
 * This allows the client to upload directly without going through our server
 */
export const generatePresignedUploadUrl = async (
  filename: string,
  contentType: string
): Promise<PresignedUrlResponse> => {
  // Generate a unique key for the image
  const extension = filename.split(".").pop() || "jpg";
  const key = `news-images/${uuidv4()}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: NEWS_IMAGES_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // Generate presigned URL valid for 5 minutes
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  // The final public URL where the image will be accessible
  const imageUrl = `https://${NEWS_IMAGES_BUCKET}.s3.${process.env.AWS_REGION || "us-west-1"}.amazonaws.com/${key}`;

  return {
    uploadUrl,
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
      Bucket: NEWS_IMAGES_BUCKET,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error("Failed to delete image from S3:", error);
    return false;
  }
};
