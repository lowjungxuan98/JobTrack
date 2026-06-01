import { NextResponse } from "next/server";
import { Client } from "minio";
import { prisma } from "@/lib/prisma";

const SIGNED_URL_TTL = 300; // seconds

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function minioClient() {
  const port = Number(process.env.MINIO_PORT ?? 9000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("MINIO_PORT must be a positive integer");
  }

  return new Client({
    endPoint: requiredEnv("MINIO_ENDPOINT"),
    port,
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: requiredEnv("MINIO_ACCESS_KEY"),
    secretKey: requiredEnv("MINIO_SECRET_KEY"),
  });
}

function getDownloadFilename(cvPath: string) {
  const basename = cvPath.split(/[\\/]/).pop() || "cv.pdf";
  const filename = basename.endsWith(".pdf") ? basename : `${basename}.pdf`;

  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job?.cv) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  const objectName = decodeURIComponent(job.cv);
  const filename = getDownloadFilename(objectName);
  const signedUrl = await minioClient().presignedGetObject(
    process.env.MINIO_BUCKET ?? "jobops-pdfs",
    objectName,
    SIGNED_URL_TTL,
    {
      "response-content-disposition": `attachment; filename="${filename}"`,
      "response-content-type": "application/pdf",
    }
  );

  return NextResponse.redirect(signedUrl);
}
