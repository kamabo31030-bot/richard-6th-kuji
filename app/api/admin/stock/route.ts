import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function mustEnv() {
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

function makeAdmin() {
  mustEnv();
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

function rankToPrefix(rank: "ss" | "s" | "a" | "b") {
  if (rank === "ss") return "SS賞";
  if (rank === "s") return "S賞";
  if (rank === "a") return "A賞";
  return "B賞";
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = String(body?.secret ?? "");

    if (!secret) {
      return NextResponse.json({ error: "管理用合言葉を入力してください" }, { status: 400 });
    }
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "合言葉が違います" }, { status: 401 });
    }

    const admin = makeAdmin();

    async function countByPrefix(prefix: string) {
      // benefit_text が "SS賞..." みたいに始まる未使用のみカウント
      const { count, error } = await admin
        .from("prize_codes")
        .select("*", { count: "exact", head: true })
        .eq("status", "unused")
        .ilike("benefit_text", `${prefix}%`);

      if (error) throw error;
      return Number(count ?? 0);
    }

    const ss = await countByPrefix(rankToPrefix("ss"));
    const s = await countByPrefix(rankToPrefix("s"));
    const a = await countByPrefix(rankToPrefix("a"));
    const b = await countByPrefix(rankToPrefix("b"));

    const total = ss + s + a + b;

    return NextResponse.json({ ss, s, a, b, total });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "サーバーエラー" },
      { status: 500 }
    );
  }
}
