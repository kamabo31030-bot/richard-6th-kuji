import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const phone = String(body.phone ?? "").trim();

    if (!phone) {
      return NextResponse.json({ error: "phone required" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // ① 抽選権を1枚取る（順番を固定）
    const { data: tickets, error: tErr } = await supabase
      .from("draw_tickets")
      .select("id")
      .eq("phone", phone)
      .eq("status", "unused")
      .gte("expires_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(1);

    if (tErr) {
      return NextResponse.json({ error: `tickets error: ${tErr.message}` }, { status: 500 });
    }
    if (!tickets || tickets.length === 0) {
      return NextResponse.json({ error: "抽選権がありません" }, { status: 400 });
    }

    const ticketId = tickets[0].id;

    // ② 未配布コードを1件取る（順番を固定）
    const { data: codes, error: cErr } = await supabase
      .from("prize_codes")
      .select("code, benefit_text")
      .eq("status", "unassigned")
      .order("code", { ascending: true })
      .limit(1);

    if (cErr) {
      return NextResponse.json({ error: `codes error: ${cErr.message}` }, { status: 500 });
    }
    if (!codes || codes.length === 0) {
      return NextResponse.json({ error: "コード在庫なし" }, { status: 400 });
    }

    const picked = codes[0];

    // ③ 先にコードを割り当て（失敗したら抽選権を消費しない）
    const { error: assignErr } = await supabase
      .from("prize_codes")
      .update({
        status: "assigned",
        assigned_phone: phone,
        assigned_at: new Date().toISOString(),
      })
      .eq("code", picked.code)
      .eq("status", "unassigned"); // 二重割当防止

    if (assignErr) {
      return NextResponse.json({ error: `assign error: ${assignErr.message}` }, { status: 500 });
    }

    // ④ 抽選権を使用済みに（最後にやる）
    const { error: useErr } = await supabase
      .from("draw_tickets")
      .update({ status: "used" })
      .eq("id", ticketId)
      .eq("status", "unused"); // 二重消費防止

    if (useErr) {
      return NextResponse.json({ error: `use ticket error: ${useErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      code: picked.code,
      benefit_text: picked.benefit_text,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `server error: ${e?.message ?? String(e)}` },
      { status: 500 }
    );
  }
}
