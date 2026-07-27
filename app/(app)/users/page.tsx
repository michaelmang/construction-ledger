import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { UserRoleControl } from "@/components/UserRoleControl";
import { InviteUserForm } from "@/components/InviteUserForm";
import { tableWrapClass, tableClass, theadClass, thClass, tbodyClass, trClass, tdClass } from "@/components/table";

// proxy.ts only asserts "signed in", not role — this page additionally
// requires admin, since the sidebar hiding the "Users" link for
// non-admins is a UX nicety, not the actual access boundary (the same
// principle app/actions/users.ts's requireAdminRole() enforces on every
// action here).
export default async function UsersPage() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 py-16 text-center text-sm text-text-2">
        Admins only.
      </div>
    );
  }

  const [allowedUsers, users] = await Promise.all([
    prisma.allowedUser.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany(),
  ]);
  const usersByEmail = new Map(users.map((u) => [u.email, u]));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Settings" title="Users" />

      <section className="max-w-md rounded-xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-text">Invite someone</h2>
        <InviteUserForm />
        <p className="mt-3 text-xs text-text-3">
          They&apos;ll be able to sign in with a magic link sent to this address once invited — no
          separate signup step.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-text">Everyone with access</h2>
        <div className={tableWrapClass}>
          <table className={tableClass}>
            <thead className={theadClass}>
              <tr>
                <th className={thClass}>Email</th>
                <th className={thClass}>Status</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody className={tbodyClass}>
              {allowedUsers.map((au) => {
                const user = usersByEmail.get(au.email);
                return (
                  <tr key={au.email} className={trClass}>
                    <td className={tdClass}>{au.email}</td>
                    <td className={tdClass}>{user ? "Signed in" : "Invited — hasn't signed in yet"}</td>
                    <td className="px-4 py-3">
                      <UserRoleControl email={au.email} role={au.role} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
