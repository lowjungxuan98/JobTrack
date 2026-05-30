"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { JobsStatus } from "@/app/generated/prisma/enums";
import { JOBS_STATUS_VALUES } from "@/app/(main)/jobs/jobs-status";

export async function updateJobsStatus(id: string, next: JobsStatus) {
  if (!JOBS_STATUS_VALUES.includes(next)) {
    throw new Error(`Invalid jobs_status value: ${next}`);
  }
  await prisma.job.update({
    where: { id },
    data: { jobsStatus: next },
  });
  revalidatePath("/jobs");
  revalidatePath("/");
}
