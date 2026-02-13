import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

const WEIGHTS = {
  ss: 0.001,
  s: 0.015,
  a: 0.12,
  b: 0.864,
} as const;

type Rank = "ss" | "s" | "a" | "b";

function pickRankByWeights(): Rank {
  const r = Math.random();
  const ss = WEIGHTS.ss;
  const s = ss + WEIGHTS.s;
  const a = s + WEIGHTS.a;

  if (r < ss) return "ss";
  if (r < s) return "s";
  if (r < a) return "a";
  return "b";
}

function fallbackOrder(rank: Rank): Rank[] {
  if (rank === "ss") return ["ss", "s", "a", "b"];
  if (rank === "s") return ["s", "a", "b"];
  if (rank === "a") return ["a", "b"];
  return ["b"];
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ✅ rank列で直接取る（これが今回の修正）
async function pickOneUnusedCodeByRank(admin: any, rank: Rank) {
  const { data, error } = await admin
    .from("prize_codes")
    .select("code, benefit_text")
    .eq("status", "unused")
    .eq("rank", rank)
    .limit(50);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const idx = Math.floor(Math.random() * data.length);
  return data[idx];
}

export async function POST(req: Request) {
  try {
    const admin = getAdminClient();

    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone);

    if (!phone) {
      return NextResponse.json(
        { error: "電話番号を入力してください" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // 抽選権取得
    const { data: ticket, error: tErr } = await admin
      .from("draw_tickets")
      .select("id")
      .eq("phone", phone)
      .eq("status", "unused")
      .gte("expires_at", nowIso)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (tErr) throw tErr;

    if (!ticket?.id) {
      return NextResponse.json(
        { error: "抽選権がありません" },
        { status: 400 }
      );
    }

    // 確率抽選
    const wanted = pickRankByWeights();

    let chosen: any = null;

    for (const r of fallbackOrder(wanted)) {
      const one = await pickOneUnusedCodeByRank(admin, r);
      if (one) {
        chosen = one;
        break;
      }
    }

    if (!chosen) {
      return NextResponse.json(
        { error: "現在くじの準備中です。スタッフへお声がけください。" },
        { status: 400 }
      );
    }

    // コード使用
    const { error: uErr } = await admin
      .from("prize_codes")
      .update({
        status: "assigned",
        assigned_phone: phone,
        assigned_at: nowIso,
      })
      .eq("code", chosen.code)
      .eq("status", "unused");

    if (uErr) throw uErr;

    // チケット消費
    const { error: useErr } = await admin
      .from("draw_tickets")
      .update({ status: "used", used_at: nowIso })
      .eq("id", ticket.id)
      .eq("status", "unused");

    if (useErr) throw useErr;

    return NextResponse.json({
      code: chosen.code,
      benefit_text: chosen.benefit_text,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "サーバーエラー" },
      { status: 500 }
    );
  }
}
