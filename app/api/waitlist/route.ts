import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Waitlist storage: insert-only table in Supabase via the REST API.
 * The publishable key is safe to ship (it can ONLY insert into this table;
 * RLS grants no read/update/delete to anon). Plain fetch, no SDK needed.
 */
const SUPABASE_URL = "https://cwgtnpcjhhlzubywrzar.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_n1a7t1VuQgA78gcJgd94Tg_JJnon-Cb";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest) {
  let body: { email?: string; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/watch2text_waitlist`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ email, source: (body.source ?? "landing").slice(0, 40) }),
  });

  // 409 = duplicate email. That person is already on the list: still a success.
  if (res.ok || res.status === 409) {
    return NextResponse.json({ ok: true });
  }

  console.error("waitlist insert failed:", res.status, await res.text());
  return NextResponse.json({ error: "Couldn't save that right now. Try again in a minute." }, { status: 502 });
}
