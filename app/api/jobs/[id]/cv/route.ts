import { NextResponse } from "next/server";
import { Client } from "minio";
import { prisma } from "@/lib/prisma";

const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const BUCKET = process.env.MINIO_BUCKET ?? "jobops-pdfs";
const SIGNED_URL_TTL = 300; // seconds

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.job.findUnique({ where: { id } });
  if (!job?.cv) {
    return NextResponse.json({ error: "CV not found" }, { status: 404 });
  }

  const signedUrl = await minio.presignedGetObject(
    BUCKET,
    decodeURIComponent(job.cv),
    SIGNED_URL_TTL
  );

  return NextResponse.redirect(signedUrl);
}
