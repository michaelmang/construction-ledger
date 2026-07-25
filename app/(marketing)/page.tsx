import Link from "next/link";
import type { Metadata } from "next";
import { Pill, PillTone } from "@/components/ui/Pill";
import { primaryButtonClass, secondaryButtonClass } from "@/components/form";

// See LANDING-PAGE-SPEC.md for the full section-by-section spec this file
// implements. Deliberately zero "use client" anywhere: the chart is a
// static SVG, the FAQ uses native <details>/<summary>, and section jumps
// are plain anchors — the whole page is eligible for static prerendering
// (no Prisma/hledger calls) and ships no client JS.
export const metadata: Metadata = {
  description:
    "Construction Ledger is job-centric accounting for builders: WIP schedules, retainage, labor burden, and cash — computed from a double-entry ledger where every write is a git commit.",
};

export default function LandingPage() {
  return (
    <div className="bg-bg text-text">
      <NavBar />
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <Features />
      <ValueBanner />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

const NAV_LINKS = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#faq", label: "FAQ" },
];

function NavBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <span className="text-sm font-semibold tracking-tight text-text">Construction Ledger</span>
        <nav className="hidden items-center gap-6 text-sm text-text-2 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-sm hover:text-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <Link href="/dashboard" className={`${primaryButtonClass} text-xs sm:text-sm`}>
          Open the app
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 pb-16 pt-20 text-center sm:pt-28">
      <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-text sm:text-5xl">
        Every job costed.
        <br />
        Every entry auditable, <span className="text-accent">forever.</span>
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base text-text-2">
        Construction Ledger is job-centric accounting for builders: WIP schedules, retainage, labor
        burden, and cash — computed from a double-entry ledger where every write is a git commit.
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link href="/dashboard" className={primaryButtonClass}>
          Open the dashboard →
        </Link>
        <a href="#how-it-works" className={secondaryButtonClass}>
          See how it works
        </a>
      </div>
      <p className="mt-4 text-xs text-text-3">Loaded with demo data · no signup required</p>
      <HeroMock />
    </section>
  );
}

function HeroMock() {
  return (
    <div className="mx-auto mt-16 max-w-3xl overflow-hidden rounded-xl border border-border bg-surface text-left shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-text-3/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-text-3/40" />
        <span className="h-2.5 w-2.5 rounded-full bg-text-3/40" />
        <span className="mx-auto rounded-md bg-surface px-3 py-1 font-mono text-[11px] text-text-3">
          construction-ledger
        </span>
      </div>
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-3 gap-3">
          <MockStat label="Cash Position" value="$92,514.20" positive />
          <MockStat label="AR Outstanding" value="$15,500.00" />
          <MockStat label="Active Jobs" value="3" />
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">
            Cash, last 8 weeks
          </div>
          <svg
            viewBox="0 0 600 160"
            preserveAspectRatio="none"
            className="mt-3 h-32 w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="hero-chart-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M8 120 L96 90 L184 96 L272 60 L360 74 L448 30 L536 42 L592 20 L592 160 L8 160 Z"
              fill="url(#hero-chart-gradient)"
            />
            <path
              d="M8 120 L96 90 L184 96 L272 60 L360 74 L448 30 L536 42 L592 20"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          <MockJobRow name="Smith Residence Addition" code="J2026-014" status="Active" value="$180,000.00" tone="positive" />
          <MockJobRow name="Miller Kitchen Remodel" code="J2026-021" status="Active" value="$95,000.00" tone="positive" />
          <MockJobRow name="Turner Garage Build" code="J2025-098" status="Complete" value="$45,000.00" tone="neutral" />
        </div>
      </div>
    </div>
  );
}

function MockStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-[10px] font-medium uppercase tracking-widest text-text-3">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-semibold tabular-nums ${positive ? "text-positive" : "text-text"}`}
      >
        {value}
      </div>
    </div>
  );
}

function MockJobRow({
  name,
  code,
  status,
  value,
  tone,
}: {
  name: string;
  code: string;
  status: string;
  value: string;
  tone: PillTone;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm">
      <div>
        <div className="font-medium text-text">{name}</div>
        <div className="font-mono text-xs tabular-nums text-text-3">{code}</div>
      </div>
      <div className="flex items-center gap-3">
        <Pill tone={tone}>{status}</Pill>
        <span className="font-mono text-sm tabular-nums text-text">{value}</span>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  center,
}: {
  eyebrow: string;
  title: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      <div className="text-[11px] font-medium uppercase tracking-widest text-accent">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-text sm:text-3xl">{title}</h2>
    </div>
  );
}

const PROBLEMS = [
  {
    title: "WIP built by hand",
    body: "Every month someone rebuilds the earned-revenue schedule in Excel. One stale formula and you're overbilled on paper, underpaid in cash.",
  },
  {
    title: "Retainage falls through the cracks",
    body: "Money clients owe you ages silently. Nobody notices the 60-day-old 5% until the job closes.",
  },
  {
    title: "No idea which jobs made money",
    body: "Labor burden and overhead never land on jobs, so margins are a feeling, not a number.",
  },
];

function ProblemSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <SectionHeading eyebrow="The Old Way" title="Spreadsheet job costing rots." center />
      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {PROBLEMS.map((p) => (
          <div key={p.title} className="rounded-xl border border-border bg-surface p-5">
            <div className="text-[15px] font-semibold text-text">{p.title}</div>
            <p className="mt-2 text-[13px] text-text-2">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text-2">
      {children}
    </div>
  );
}

function Step({
  number,
  title,
  body,
  children,
}: {
  number: number;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-accent text-sm font-medium text-accent">
        {number}
      </div>
      <div className="mt-3 text-[15px] font-semibold text-text">{title}</div>
      <p className="mt-1.5 text-[13px] text-text-2">{body}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <SectionHeading eyebrow="How It Works" title="Set it up once. Read the truth daily." center />
      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        <Step
          number={1}
          title="Create jobs and budgets"
          body="Contract value, retainage %, cost codes with budgeted amounts."
        >
          <MockLine>J2026-014 · $180,000.00 · retainage 10%</MockLine>
        </Step>
        <Step
          number={2}
          title="Record work as it happens"
          body="Expenses, labor with real burden, progress billings. Every entry is double-entry and validated before it lands."
        >
          <MockLine>expense: J2026-014 03-CONCRETE $4,200.00</MockLine>
        </Step>
        <Step
          number={3}
          title="Edits never overwrite history"
          body="Change an entry and the ledger records a new commit; the old state stays in the audit trail."
        >
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs">
            <span className="text-text-3 line-through">$999.00</span>{" "}
            <span className="text-accent">→ $1,050.00</span>
            <div className="mt-1 text-[11px] text-text-3">edit expense: … · nothing is ever erased</div>
          </div>
        </Step>
      </div>
    </section>
  );
}

function FeatureRow({
  eyebrow,
  title,
  body,
  bullets,
  mock,
  reverse,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  mock: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-10 sm:grid-cols-2">
      <div className={reverse ? "sm:order-2" : ""}>
        <div className="text-[11px] font-medium uppercase tracking-widest text-accent">{eyebrow}</div>
        <h3 className="mt-2 text-2xl font-semibold text-text">{title}</h3>
        <p className="mt-3 text-sm text-text-2">{body}</p>
        <ul className="mt-4 space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-text-2">
              <span className="mt-0.5 text-accent" aria-hidden="true">
                ✓
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? "sm:order-1" : ""}>{mock}</div>
    </div>
  );
}

function WipRow({ name, pct, tone, label }: { name: string; pct: number; tone: PillTone; label: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-text">{name}</span>
        <Pill tone={tone}>{label}</Pill>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-mono text-xs tabular-nums text-text-2">{pct}%</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`h-full ${tone === "negative" ? "bg-negative" : "bg-accent"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function WipMock() {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
      <WipRow name="Smith Residence Addition" pct={13} tone="warn" label="Underbilled" />
      <WipRow name="Miller Kitchen Remodel" pct={68} tone="negative" label="Overbilled" />
    </div>
  );
}

const ACTIVITY_MOCK_ROWS = [
  {
    kind: "Expense",
    desc: "Recorded expense on Smith Residence Addition (J2026-014)",
    amount: "$4,200.00",
    date: "2026-07-25",
  },
  {
    kind: "Payment",
    desc: "Recorded payment on Miller Kitchen Remodel (J2026-021)",
    amount: "$10,000.00",
    date: "2026-07-24",
  },
  {
    kind: "Progress Billing",
    desc: "Recorded progress billing on Smith Residence Addition (J2026-014)",
    amount: "$18,000.00",
    date: "2026-07-20",
  },
  {
    kind: "Bill Payment",
    desc: "Recorded bill payment on Turner Garage Build (J2025-098)",
    amount: "$5,600.00",
    date: "2026-07-18",
  },
];

function ActivityMock() {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-surface">
      {ACTIVITY_MOCK_ROWS.map((r) => (
        <div key={r.desc} className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Pill tone="neutral">{r.kind}</Pill>
            <div className="mt-1 truncate text-xs text-text-2">{r.desc}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-mono text-sm tabular-nums text-text">{r.amount}</div>
            <div className="text-[11px] text-text-3">{r.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertsMock() {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-lg border border-negative/30 bg-negative-soft px-4 py-2.5 text-sm">
        <span className="text-text">
          Concrete on J2026-014 is <span className="font-mono text-negative">112%</span> of estimate
        </span>
        <Pill tone="negative">Over Budget</Pill>
      </div>
      <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-warn-soft px-4 py-2.5 text-sm">
        <span className="text-text">Miller Kitchen Remodel — retainage outstanding 74 days</span>
        <Pill tone="warn">Retainage</Pill>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="mx-auto max-w-5xl space-y-20 px-6 py-16 sm:py-24">
      <FeatureRow
        eyebrow="Job Costing"
        title="WIP without the spreadsheet."
        body="Percent complete from actual costs against estimates. Earned revenue and over/under billing computed per job, live — the schedule your bank asks for, without the monthly Excel ritual."
        bullets={[
          "% complete from cost-to-complete estimates",
          "Earned revenue vs billed to date",
          "Overbilled / underbilled flags per job",
          "Company-wide WIP rollup",
        ]}
        mock={<WipMock />}
      />
      <FeatureRow
        eyebrow="Audit Trail"
        title="Books you can prove."
        body="Every accounting entry is a commit in the ledger's own git history. Nothing can be silently altered — every record, edit, and delete leaves a permanent, timestamped trace."
        bullets={[
          "One commit per entry, edit, and delete",
          "Full history browsable in-app",
          "Plain-text ledger you can read without us",
          "Verified double-entry on every write",
        ]}
        mock={<ActivityMock />}
        reverse
      />
      <FeatureRow
        eyebrow="Cash & Retainage"
        title="Nothing ages silently."
        body="AR and AP aging, retainage held and receivable, and a dashboard that flags what needs chasing — before it becomes a write-off."
        bullets={[
          "Retainage receivable & payable per job",
          "AR/AP aging buckets",
          "Over-budget cost code alerts",
          "Cash trend at a glance",
        ]}
        mock={<AlertsMock />}
      />
    </section>
  );
}

function ValueBanner() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-border bg-surface px-6 py-14 text-center sm:px-16">
        <h2 className="mx-auto max-w-2xl text-2xl font-semibold text-text sm:text-3xl">
          Your books become an <span className="text-accent">asset</span>, not a liability.
        </h2>
        <div className="mt-10 grid gap-8 text-left sm:grid-cols-2 sm:gap-12">
          <div>
            <div className="text-[15px] font-semibold text-text">Walk into the bank ready</div>
            <p className="mt-1.5 text-sm text-text-2">
              WIP schedule, aging, and margins are always current — not reconstructed the week before a
              loan review.
            </p>
          </div>
          <div>
            <div className="text-[15px] font-semibold text-text">Hand auditors a git log</div>
            <p className="mt-1.5 text-sm text-text-2">
              Every number traces to a commit. Due diligence becomes a checkout, not an excavation.
            </p>
          </div>
        </div>
        <Link href="/dashboard" className={`${primaryButtonClass} mt-10 inline-block`}>
          Open the dashboard →
        </Link>
      </div>
    </section>
  );
}

const FAQ_ITEMS = [
  {
    q: "Where does my data live?",
    a: "In a Postgres database and a plain-text ledger file in a private git repository. Both are yours; the ledger is readable with any text editor even if you stop using the app.",
  },
  {
    q: "What's hledger and why should I care?",
    a: "A 15-year-old open-source double-entry accounting engine. It validates every transaction balances before anything is saved. You never see it — you just get books that always add up.",
  },
  {
    q: "Does it replace QuickBooks?",
    a: "It replaces the job-costing spreadsheet next to QuickBooks first. It keeps real double-entry books, but talk to your accountant before switching systems of record.",
  },
  {
    q: "What happens when I edit or delete an entry?",
    a: "A new commit records the change. The prior state stays in history permanently — the audit trail is append-only by construction.",
  },
  {
    q: "Can my whole team use it?",
    a: "Multi-user access and sign-in are the next milestone. Today it's single-company, shared-link access for a small trusted group.",
  },
];

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0 text-text-3 transition-transform duration-150 group-open:rotate-180"
    >
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <SectionHeading eyebrow="FAQ" title="A few honest questions first." center />
      <div className="mx-auto mt-10 max-w-2xl space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details key={item.q} className="group rounded-lg border border-border bg-surface px-4 py-3">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-text [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">
              {item.q}
              <ChevronIcon />
            </summary>
            <p className="mt-2 text-sm text-text-2">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-24">
      <div className="rounded-2xl border border-border bg-surface px-6 py-16 text-center sm:px-16">
        <h2 className="mx-auto max-w-xl text-2xl font-semibold leading-tight text-text sm:text-3xl">
          Your next job deserves books
          <br />
          that <span className="text-accent">never lie.</span>
        </h2>
        <Link href="/dashboard" className={`${primaryButtonClass} mt-8 inline-block`}>
          Open the dashboard →
        </Link>
        <p className="mt-4 text-xs text-text-3">Loaded with demo data · no signup required</p>
      </div>
    </section>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-widest text-text-3">{title}</div>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <div className="text-sm font-semibold text-text">Construction Ledger</div>
            <p className="mt-2 max-w-xs text-sm text-text-2">
              Job-centric accounting for construction. Built on a ledger that never forgets.
            </p>
          </div>
          <FooterColumn title="Product">
            <li>
              <a href="#how-it-works" className="text-sm text-text-2 hover:text-text">
                How it works
              </a>
            </li>
            <li>
              <a href="#features" className="text-sm text-text-2 hover:text-text">
                Features
              </a>
            </li>
            <li>
              <a href="#faq" className="text-sm text-text-2 hover:text-text">
                FAQ
              </a>
            </li>
          </FooterColumn>
          <FooterColumn title="App">
            <li>
              <Link href="/dashboard" className="text-sm text-text-2 hover:text-text">
                Dashboard
              </Link>
            </li>
            <li>
              <Link href="/reports" className="text-sm text-text-2 hover:text-text">
                Reports
              </Link>
            </li>
            <li>
              <Link href="/activity" className="text-sm text-text-2 hover:text-text">
                Activity
              </Link>
            </li>
          </FooterColumn>
        </div>
        <div className="mt-10 border-t border-border pt-6 text-xs text-text-3">
          © 2026 Construction Ledger
        </div>
      </div>
    </footer>
  );
}
