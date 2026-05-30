import { JobsStatus } from "@/app/generated/prisma/enums";

export const JOBS_STATUS_VALUES: JobsStatus[] = [
  "PendingApply",
  "Applied",
  "InProgress",
  "Rejected",
];

export const JOBS_STATUS_LABELS: Record<JobsStatus, string> = {
  PendingApply: "Pending Apply",
  Applied: "Applied",
  InProgress: "In Progress",
  Rejected: "Rejected",
};

export const JOBS_STATUS_TONES: Record<JobsStatus, string> = {
  PendingApply: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  Applied: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  InProgress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};
