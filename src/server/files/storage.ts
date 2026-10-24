import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// Private object storage (Security #11). Production: S3-compatible bucket
// (Cloudflare R2) — never public. Development: a local folder outside /public.

interface Driver {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

function s3Driver(): Driver {
  const client = new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  const Bucket = process.env.S3_BUCKET!;
  return {
    async put(Key, Body, ContentType) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, ServerSideEncryption: process.env.S3_ENDPOINT ? undefined : "AES256" }));
    },
    async get(Key) {
      const res = await client.send(new GetObjectCommand({ Bucket, Key }));
      return Buffer.from(await res.Body!.transformToByteArray());
    },
  };
}

function localDriver(): Driver {
  const root = path.resolve(process.env.STORAGE_DIR ?? ".storage");
  const safe = (key: string) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return full;
  };
  return {
    async put(key, bytes) {
      const full = safe(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, bytes, { mode: 0o600 });
    },
    async get(key) {
      return readFile(safe(key));
    },
  };
}

let driver: Driver | null = null;
export function storage(): Driver {
  if (driver) return driver;
  if (process.env.S3_BUCKET) driver = s3Driver();
  else if (process.env.NODE_ENV === "production") throw new Error("S3_BUCKET must be set in production");
  else driver = localDriver();
  return driver;
}
