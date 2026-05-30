import { prisma } from "@/lib/prisma";
import { columns } from "./columns";
import { DataTable } from "./data-table";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: roleSlug } = await searchParams;
  const where = roleSlug ? { role: { slug: roleSlug } } : {};

  const [jobs, activeRole] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ postedDate: "desc" }, { id: "desc" }],
      include: { role: true },
    }),
    roleSlug
      ? prisma.jobRole.findUnique({ where: { slug: roleSlug } })
      : Promise.resolve(null),
  ]);

  const heading = activeRole ? activeRole.name.replace(/_/g, " ") : "All Jobs";

  return (
    <main className="p-4 sm:p-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold capitalize">{heading}</h1>
        <span className="text-sm text-zinc-500">{jobs.length} total</span>
      </div>
      <DataTable columns={columns} data={jobs} />
    </main>
  );
}
