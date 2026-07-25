import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "./lib/db";

// Auth.js v5 (single-company, invite-only — see V4-AUDIT-AND-SPEC.md Phase 1).
// Email magic-link only for now; adding an OAuth provider later is additive
// (push it into the `providers` array below, no other changes needed).
//
// Sign-in gate: nobody gets a magic-link email, let alone a session, unless
// their address is already in AllowedUser. Enforced in the `signIn`
// callback below, which per @auth/core's own type comment is called BEFORE
// the verification email is sent (when `email.verificationRequest` is
// true) as well as after the link is clicked — so an unlisted email never
// receives mail in the first place, not just "never gets a session."

async function isAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const allowed = await prisma.allowedUser.findUnique({ where: { email } });
  return allowed !== null;
}

// The Prisma adapter's own createUser has no idea about roles (Auth.js has
// no concept of them) — wrap it so a brand-new User row is seeded with the
// role its AllowedUser invite specified, defaulting to the least-privileged
// "viewer" if the invite (unusually) didn't set one.
const baseAdapter = PrismaAdapter(prisma);
const adapter: Adapter = {
  ...baseAdapter,
  async createUser(user) {
    // Deliberately not spreading `user` — it includes an `id` the email
    // provider pre-generates (see @auth/core's send-token.js), but this
    // schema's User.id is @default(cuid()) and should always come from
    // Prisma, not from whatever the provider happened to mint.
    const allowed = await prisma.allowedUser.findUnique({ where: { email: user.email } });
    return prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: allowed?.role ?? "viewer",
      },
    });
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  // Vercel terminates TLS and proxies the request, so Auth.js can't
  // otherwise trust the Host header it sees — required for any deployment
  // that isn't Auth.js's own hosting.
  trustHost: true,
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.AUTH_EMAIL_FROM,
    }),
  ],
  pages: {
    // All three point at the same page — it branches on ?type=email
    // ("check your inbox") vs ?error=AccessDenied ("not on the invite
    // list") vs neither (the actual form) — see
    // app/(marketing)/sign-in/page.tsx.
    signIn: "/sign-in",
    error: "/sign-in",
    verifyRequest: "/sign-in",
  },
  callbacks: {
    async signIn({ user }) {
      // Called twice for the email flow: once before the verification
      // email is sent (email.verificationRequest === true) and once after
      // the link is clicked. Same check both times — an unlisted address
      // is rejected before Resend is ever hit, and rejected again as
      // defense-in-depth if the first check were ever bypassed.
      return isAllowed(user.email);
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = user.role;
      }
      return session;
    },
  },
});
