// MinIO upload helper for final attachment PDFs.
import path from "node:path";
import { Client as MinioClient } from "minio";
import { cfgBool, cfgInt, cfgString } from "./config";
import { log } from "./logging";

const STAGE = "minio";

function clientFromConfig(): MinioClient {
  const endpoint = cfgString("minio.endpoint", "localhost").replace(/^https?:\/\//, "");
  const [host, portStr] = endpoint.includes(":") ? endpoint.split(":") : [endpoint, ""];
  return new MinioClient({
    endPoint: host,
    port: cfgInt("minio.port", Number(portStr) || 9000),
    useSSL: cfgBool("minio.secure"),
    accessKey: cfgString("minio.access_key", "minioadmin"),
    secretKey: cfgString("minio.secret_key", "minioadmin"),
  });
}

function bucketFromConfig(): string {
  return cfgString("minio.bucket", "jobops-pdfs");
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

export function normalizeObjectName(objectName: string): string {
  return objectName.replace(/^sre\//, "devops/");
}

export async function uploadPdfs(pdfs: string[], baseDir: string): Promise<Map<string, string>> {
  if (!pdfs.length) return new Map();
  const bucket = bucketFromConfig();
  const result = new Map<string, string>();
  if (!bucket) {
    log(STAGE, "minio.bucket is empty - skipping upload");
    return result;
  }
  let client: MinioClient;
  try {
    client = clientFromConfig();
  } catch (e) {
    log(STAGE, `client setup failed (${(e as Error).message}) - skipping upload`);
    return result;
  }
  try {
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      await client.makeBucket(bucket, "");
      log(STAGE, `created bucket ${bucket}`);
    }
  } catch (e) {
    log(STAGE, `bucket check failed for ${bucket} (${(e as Error).message}) - skipping upload`);
    return result;
  }
  let uploaded = 0;
  let failed = 0;
  for (const pdf of pdfs) {
    try {
      const objectName = normalizeObjectName(toPosix(path.relative(path.resolve(baseDir), path.resolve(pdf))));
      await client.fPutObject(bucket, objectName, pdf, { "Content-Type": "application/pdf" });
      uploaded++;
      result.set(pdf, objectName);
    } catch (e) {
      failed++;
      log(STAGE, `upload failed for ${pdf} (${(e as Error).message})`);
    }
  }
  log(STAGE, `uploaded ${uploaded}/${pdfs.length} PDF(s) to ${bucket}${failed ? ` (${failed} failed)` : ""}`);
  return result;
}
