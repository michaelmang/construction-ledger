import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertWritesAllowed } from "./env-guard";

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

// A single choke point for every Prisma write across every model, present
// and future — cheaper and more reliable than auditing every app/actions
// file individually for an assertWritesAllowed() call. See
// lib/env-guard.ts for what this actually blocks and why.
function buildClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        $allOperations({ operation, args, query }) {
          if (WRITE_OPERATIONS.has(operation)) {
            assertWritesAllowed();
          }
          return query(args);
        },
      },
    },
  });
}

// Reuse a single instance across hot reloads in dev; each client opens its
// own connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof buildClient> };

export const prisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
