"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { Job, JobRole } from "@/app/generated/prisma/client";
import { JOBS_STATUS_LABELS } from "./jobs-status";
import { JobsStatusCell } from "./jobs-status-cell";

export type JobWithRole = Job & { role: JobRole };

function PipelineStatusPill({ status }: { status: string }) {
  const tone = status.toLowerCase().startsWith("success")
    ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
    : status.toLowerCase().startsWith("failed")
    ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
    : "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${tone}`}>
      {status}
    </span>
  );
}

export const columns: ColumnDef<JobWithRole>[] = [
  {
    accessorKey: "companyName",
    header: "Company",
  },
  {
    accessorKey: "jobRoleName",
    header: "Role",
    cell: ({ row }) => (
      <span className="block max-w-xs truncate" title={row.original.jobRoleName}>
        {row.original.jobRoleName}
      </span>
    ),
  },
  {
    id: "category",
    header: "Category",
    accessorFn: (r) => r.role.name.replace(/_/g, " "),
    cell: ({ row }) => (
      <span className="capitalize text-zinc-600 dark:text-zinc-400">
        {row.original.role.name.replace(/_/g, " ")}
      </span>
    ),
  },
  {
    id: "postedDate",
    header: "Posted",
    accessorFn: (r) =>
      r.postedDate ? r.postedDate.toISOString().slice(0, 10) : "",
    cell: ({ row }) =>
      row.original.postedDate
        ? row.original.postedDate.toISOString().slice(0, 10)
        : "—",
  },
  {
    accessorKey: "pipelineStatus",
    header: "Pipeline",
    cell: ({ row }) => <PipelineStatusPill status={row.original.pipelineStatus} />,
  },
  {
    id: "jobsStatus",
    header: "Status",
    accessorFn: (r) => JOBS_STATUS_LABELS[r.jobsStatus],
    cell: ({ row }) => (
      <JobsStatusCell id={row.original.id} value={row.original.jobsStatus} />
    ),
  },
  {
    id: "cv",
    header: "CV",
    cell: ({ row }) =>
      row.original.cv ? (
        <a
          href={`/api/jobs/${row.original.id}/cv`}
          download
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-white text-xs font-medium hover:bg-indigo-700"
        >
          CV
        </a>
      ) : (
        <span className="text-zinc-400">—</span>
      ),
  },
  {
    id: "link",
    header: "Link",
    cell: ({ row }) => (
      <a
        href={row.original.url}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md bg-black px-3 py-1.5 text-white text-xs font-medium hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
      >
        Open
      </a>
    ),
  },
];
