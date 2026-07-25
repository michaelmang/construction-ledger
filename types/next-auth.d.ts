import { DefaultSession } from "next-auth";

// Auth.js has no concept of roles — this app's own addition, copied onto
// the User row from AllowedUser at first sign-in (see auth.ts). Declared
// here so `session.user.role`/`.id` type-check everywhere `auth()` is
// called, instead of every call site casting.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
  }
}
