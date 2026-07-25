import { NextRequest, NextResponse } from "next/server";
import { snapshotMetadata } from "@/lib/metadata-snapshot";

// Triggered by Vercel Cron (see vercel.json's `crons` entry, daily). Vercel
// sends `Authorization: Bearer $CRON_SECRET` on cron-triggered requests when
// CRON_SECRET is set — verified here so this route can't be triggered by
// arbitrary internet traffic. Fails closed: an unset CRON_SECRET means
// nothing can ever authenticate, not that the check is skipped.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { takenAt } = await snapshotMetadata();
  return NextResponse.json({ ok: true, takenAt });
}
