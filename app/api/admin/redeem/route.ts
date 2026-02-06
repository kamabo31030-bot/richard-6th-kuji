import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { secret, code } = await req.json();

  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "合言葉が違います" }, { status: 401 });
  }
  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }

  const shortCode = code.trim().toUpperCase();

  // 完全コード or 末尾一致（短縮コード）で検索
  const { data: rows, error: findErr } = await supabase
    .from("prize_codes")
    .select("code")
    .eq("status", "assigned");

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  const target = rows?.find(
    (r) =>
      r.code === shortCode ||
      r.code.endsWith(shortCode)
  );

  if (!target) {
    return NextResponse.json(
      { error: "未使用コードが見つかりません" },
      { status: 400 }
    );
  }

  const { error: updateErr } = await supabase
    .from("prize_codes")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
    })
    .eq("code", target.code);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
