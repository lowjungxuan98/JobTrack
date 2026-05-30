import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [total, statusGroups, roles] = await Promise.all([
    prisma.job.count(),
    prisma.job.groupBy({
      by: ["status"],
      _count: { status: true },
      orderBy: { _count: { status: "desc" } },
    }),
    prisma.jobRole.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { jobs: true } } },
    }),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <Link
            href="/jobs"
            className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            View all jobs →
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Applications" value={total} />
          {statusGroups.map((g) => (
            <StatCard key={g.status} label={g.status} value={g._count.status} />
          ))}
        </div>

        <h2 className="text-lg font-semibold mb-3">By Role</h2>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 uppercase text-xs">
              <tr>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4 text-right">Jobs</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr
                  key={role.id}
                  className="border-t border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                >
                  <td className="py-3 px-4 font-medium capitalize">
                    {role.name.replace(/_/g, " ")}
                  </td>
                  <td className="py-3 px-4 text-right text-zinc-600 dark:text-zinc-400">
                    {role._count.jobs}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/jobs?role=${role.slug}`}
                      className="text-xs text-zinc-500 hover:text-black dark:hover:text-white"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
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
