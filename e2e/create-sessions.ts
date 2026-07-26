// Run via `tsx` from e2e/global-setup.ts, not imported directly by
// Playwright — Playwright's own TS loader can't handle the generated
// Prisma client's ESM `import.meta` usage (same reason scripts/seed-demo.ts
// is invoked as `tsx scripts/seed-demo.ts` rather than imported).
//
// Creates two signed-in sessions (admin + viewer) directly via Prisma, the
// same Session row Auth.js itself would create after a real magic-link
// click-through, and writes each as a Playwright storageState JSON file —
// see e2e/global-setup.ts's header comment for why this exists instead of
// automating a real email round-trip.
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";

const SESSION_COOKIE_NAME = "authjs.session-token";
const ADMIN_EMAIL = "e2e-admin@construction-ledger.test";
const VIEWER_EMAIL = "e2e-viewer@construction-ledger.test";
const AUTH_DIR = path.join(__dirname, ".auth");

async function createSessionStorageState(
  hostname: string,
  email: string,
  role: "admin" | "viewer",
  fileName: string,
): Promise<void> {
  await prisma.allowedUser.upsert({
    where: { email },
    create: { email, role },
    update: { role },
  });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name: `E2E ${role}`, role },
    update: { role },
  });

  const sessionToken = randomUUID();
  await prisma.session.create({
    data: {
      sessionToken,
      userId: user.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const storageState = {
    cookies: [
      {
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        domain: hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
  await fs.writeFile(path.join(AUTH_DIR, fileName), JSON.stringify(storageState, null, 2));
}

async function main(): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const hostname = new URL(baseURL).hostname;
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await createSessionStorageState(hostname, ADMIN_EMAIL, "admin", "admin.json");
  await createSessionStorageState(hostname, VIEWER_EMAIL, "viewer", "viewer.json");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    await prisma.$disconnect();
    console.error(err);
    process.exit(1);
  });
