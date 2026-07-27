"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/actions/auth";
import { navLinksFor, SidebarUser } from "@/components/nav-links";

// Below `lg`, the fixed Sidebar is hidden (see Sidebar.tsx) and this top
// bar + slide-in drawer takes over (V4 spec Phase 3: "the app it opens
// into is unusable on a phone"). A drawer, not a bottom tab bar — there
// are up to 11 destinations here, too many for a handful of bottom icons
// to represent without a "More" catch-all that just reinvents this same
// drawer one tap deeper.
export function MobileNav({ user }: { user: SidebarUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Closing the drawer on route change (not just backdrop/X click) means a
  // link tap always lands on a clean page, not a page with the drawer still
  // open over it. Adjusted during render rather than in an effect (React's
  // recommended pattern for "reset state when a prop changes" —
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  // so it can't trigger the cascading-render lint the effect version did.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }
  const allLinks = navLinksFor(user);

  return (
    <div className="lg:hidden">
      <div className="fixed inset-x-0 top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-text">
          Construction Ledger
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-md text-text-2 hover:bg-surface-2"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[80%] max-w-[300px] flex-col border-r border-border bg-surface">
            <div className="flex items-center justify-between px-5 py-5">
              <span className="text-sm font-semibold tracking-tight text-text">Construction Ledger</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-surface-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2">
              {allLinks.map((link) => {
                const isActive = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`mb-0.5 flex items-center rounded-md border-l-2 px-3 py-2.5 text-sm ${
                      isActive
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-transparent text-text-2 hover:bg-surface-2 hover:text-text"
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
            {user && (
              <div className="border-t border-border px-4 py-3">
                <div className="truncate text-xs text-text-2" title={user.email}>
                  {user.email}
                </div>
                <div className="text-[11px] capitalize text-text-3">{user.role}</div>
                <form action={signOutAction} className="mt-2">
                  <button type="submit" className="text-xs text-text-3 hover:text-text hover:underline">
                    Sign out
                  </button>
                </form>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
