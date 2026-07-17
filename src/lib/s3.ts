import { S3Client } from "@aws-sdk/client-s3";

const requiredEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set.`);
  }
  return value;
};

export const S3_BUCKET = () => requiredEnv("S3_BUCKET");

let client: S3Client | undefined;

/** S3-compatible client for the self-hosted MinIO instance (not AWS). */
export const getS3Client = (): S3Client => {
  if (client) {
    return client;
  }

  client = new S3Client({
    region: process.env.S3_REGION || "us-east-1",
    endpoint: requiredEnv("S3_ENDPOINT"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnv("S3_ACCESS_KEY"),
      secretAccessKey: requiredEnv("S3_SECRET_KEY"),
    },
  });

  return client;
};
