// One-time bootstrap for the very first admin. Every other invite happens
// through the /users page, but that page itself requires being signed in
// as an admin — on a fresh deploy nobody is, so this script breaks the
// chicken-and-egg problem by writing the first AllowedUser row directly.
//
// Usage: npx tsx scripts/bootstrap-admin.ts you@company.com

import "dotenv/config";
import { prisma } from "../lib/db";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Usage: npx tsx scripts/bootstrap-admin.ts you@company.com");
    process.exit(1);
  }

  await prisma.allowedUser.upsert({
    where: { email },
    create: { email, role: "admin" },
    update: { role: "admin" },
  });
  await prisma.user.updateMany({ where: { email }, data: { role: "admin" } });

  console.log(`${email} can now sign in as admin. Invite everyone else from /users.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
