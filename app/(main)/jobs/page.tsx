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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="w-full min-w-0">
        <div className="mb-6 flex items-baseline justify-between">
          <h1 className="text-xl sm:text-2xl font-semibold capitalize">{heading}</h1>
          <span className="text-sm text-zinc-500">{jobs.length} total</span>
        </div>
        <DataTable columns={columns} data={jobs} />
      </div>
    </div>
  );
}
