import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

type SeedJob = {
  company_name: string;
  job_role: string;
  posted_date: string | null;
  url: string;
  status: string;
};

const dataPath = join(process.cwd(), "prisma/seed-data/report.json");
const dataset = JSON.parse(readFileSync(dataPath, "utf8")) as Record<string, SeedJob[]>;

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  let upsertedRoles = 0;
  let upsertedJobs = 0;
  const roles = new Map<string, string>();

  for (const [sourceSlug, rows] of Object.entries(dataset)) {
    const slug = sourceSlug === "sre" ? "devops" : sourceSlug;
    let roleId = roles.get(slug);
    if (!roleId) {
      const role = await prisma.jobRole.upsert({
        where: { slug },
        update: {},
        create: { slug, name: slug },
      });
      roleId = role.id;
      roles.set(slug, roleId);
      upsertedRoles++;
    }

    for (const r of rows) {
      await prisma.job.upsert({
        where: { url: r.url },
        update: {
          companyName: r.company_name,
          jobRoleName: r.job_role,
          postedDate: r.posted_date ? new Date(r.posted_date) : null,
          pipelineStatus: r.status,
          jobRoleId: roleId,
        },
        create: {
          companyName: r.company_name,
          jobRoleName: r.job_role,
          postedDate: r.posted_date ? new Date(r.posted_date) : null,
          url: r.url,
          pipelineStatus: r.status,
          jobRoleId: roleId,
        },
      });
      upsertedJobs++;
    }
  }

  console.log(`Upserted ${upsertedRoles} roles and ${upsertedJobs} jobs.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
