import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { secret, phone } = await req.json();

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "合言葉が違います" }, { status: 401 });
  }
  if (!phone) {
    return NextResponse.json({ error: "phone required" }, { status: 400 });
  }

  // 期限：2026-04-30 23:59 (JST)
  const expiresAt = "2026-04-30T14:59:59.000Z";

  const { error } = await supabase.from("draw_tickets").insert({
    phone,
    expires_at: expiresAt,
    status: "unused",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
