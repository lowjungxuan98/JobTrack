import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  JOBS_STATUS_LABELS,
  JOBS_STATUS_VALUES,
} from "@/app/(main)/jobs/jobs-status";
import { DashboardRoleTable } from "./dashboard-role-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [total, statusGroups, roles] = await Promise.all([
    prisma.job.count(),
    prisma.job.groupBy({
      by: ["jobsStatus"],
      _count: { jobsStatus: true },
      orderBy: { _count: { jobsStatus: "desc" } },
    }),
    prisma.jobRole.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { jobs: true } } },
    }),
  ]);

  const counts = Object.fromEntries(
    statusGroups.map((g) => [g.jobsStatus, g._count.jobsStatus]),
  );

  return (
    <div className="min-h-screen bg-zinc-50 p-4 dark:bg-black sm:p-6 lg:p-8">
      <div className="w-full min-w-0">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold sm:text-3xl">Dashboard</h1>
          <Link
            href="/jobs"
            className="w-fit rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            View all jobs →
          </Link>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Applications" value={total} />
          {JOBS_STATUS_VALUES.map((s) => (
            <StatCard
              key={s}
              label={JOBS_STATUS_LABELS[s]}
              value={counts[s] ?? 0}
            />
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-3">By Role</h2>
        <DashboardRoleTable
          roles={roles.map((role) => ({
            id: role.id,
            name: role.name,
            slug: role.slug,
            count: role._count.jobs,
          }))}
        />
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5">
      <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">{label}</p>
      <p className="text-3xl font-semibold">{value}</p>
    </div>
  );
}
