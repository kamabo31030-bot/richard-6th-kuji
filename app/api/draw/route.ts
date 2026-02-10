import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      `Missing env. URL=${!!supabaseUrl} SERVICE=${!!serviceKey} (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)`
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

// ====== ★確率設定：SSは 1/1000（0.1%） ======
const WEIGHTS = {
  ss: 0.001, // 0.1% = 1/1000（「800〜1200本に1本」の中間で運用しやすい）
  s: 0.015, // 1.5%（ここは好みで調整OK）
  a: 0.12, // 12%（ここも好みで調整OK）
  b: 0.864, // 残り（合計1.0になるように）
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

function rankToPrefix(rank: Rank) {
  if (rank === "ss") return "SS賞";
  if (rank === "s") return "S賞";
  if (rank === "a") return "A賞";
  return "B賞";
}

function fallbackOrder(rank: Rank): Rank[] {
  if (rank === "ss") return ["ss", "s", "a", "b"];
  if (rank === "s") return ["s", "a", "b"];
  if (rank === "a") return ["a", "b"];
  return ["b"];
}

async function pickOneUnusedCodeByRank(
  admin: ReturnType<typeof createClient>,
  rank: Rank
) {
  const prefix = rankToPrefix(rank);

  const { data, error } = await admin
    .from("prize_codes")
    .select("code, benefit_text")
    .eq("status", "unused")
    .ilike("benefit_text", `${prefix}%`)
    .limit(30);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const idx = Math.floor(Math.random() * data.length);
  return data[idx] as { code: string; benefit_text: string };
}

export async function POST(req: Request) {
  try {
    const admin = getAdmin(); // ★ここで初めて env を読む（ビルド時に死なない）

    const body = await req.json().catch(() => ({}));
    const phone = normalizePhone(body?.phone);

    if (!phone) {
      return NextResponse.json(
        { error: "電話番号を入力してください" },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();

    // 1) 抽選権を1枚確保
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
        { error: "抽選権がありません（期限切れの可能性もあります）" },
        { status: 400 }
      );
    }

    // 2) まず確率で狙う賞を決める（SSは1/1000）
    const wanted = pickRankByWeights();

    // 3) 在庫切れなら下位へ落とす
    let chosen: { code: string; benefit_text: string } | null = null;

    for (const r of fallbackOrder(wanted)) {
      const one = await pickOneUnusedCodeByRank(admin, r);
      if (one) {
        chosen = one;
        break;
      }
    }

    if (!chosen) {
      return NextResponse.json(
        { error: "景品コード在庫がありません（未使用が0件）" },
        { status: 400 }
      );
    }

    // 4) コードを割り当て → 抽選権を使用済み
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
