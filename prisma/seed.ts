import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const concrete = await prisma.costCode.upsert({
    where: { code: "03-CONCRETE" },
    update: {},
    create: { code: "03-CONCRETE", name: "Concrete", csiDivision: "03" },
  });
  const carpentry = await prisma.costCode.upsert({
    where: { code: "06-CARPENTRY" },
    update: {},
    create: { code: "06-CARPENTRY", name: "Carpentry", csiDivision: "06" },
  });

  const job = await prisma.job.upsert({
    where: { code: "J2026-014" },
    update: {},
    create: {
      code: "J2026-014",
      name: "Smith Residence Addition",
      clientName: "Smith Residence",
      contractValue: "180000.00",
      retainagePct: "0.10",
      startDate: new Date("2026-06-01"),
    },
  });

  await prisma.jobBudget.upsert({
    where: { jobId_costCodeId: { jobId: job.id, costCodeId: concrete.id } },
    update: {},
    create: { jobId: job.id, costCodeId: concrete.id, budgetedAmount: "42000.00" },
  });
  await prisma.jobBudget.upsert({
    where: { jobId_costCodeId: { jobId: job.id, costCodeId: carpentry.id } },
    update: {},
    create: { jobId: job.id, costCodeId: carpentry.id, budgetedAmount: "38000.00" },
  });

  console.log(`Seeded job ${job.code} with cost codes ${concrete.code}, ${carpentry.code}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
