import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_SECRET!;

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = body?.secret ?? "";
    const query = body?.query ?? "";

    if (!secret || secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "合言葉が違います" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    let phone = normalizePhone(query);

    // 電話番号じゃない場合 → コード検索
    if (!phone || phone.length < 8) {
      const { data: row } = await admin
        .from("prize_codes")
        .select("assigned_phone")
        .ilike("code", `%${query.slice(-4)}`)
        .limit(1)
        .maybeSingle();

      if (!row?.assigned_phone) {
        return NextResponse.json({ error: "該当ユーザーなし" }, { status: 404 });
      }

      phone = row.assigned_phone;
    }

    // 抽選権集計
    const { count: unused } = await admin
      .from("draw_tickets")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("status", "unused");

    const { count: used } = await admin
      .from("draw_tickets")
      .select("*", { count: "exact", head: true })
      .eq("phone", phone)
      .eq("status", "used");

    // コード一覧
    const { data: codes } = await admin
      .from("prize_codes")
      .select("code, benefit_text, status, assigned_at")
      .eq("assigned_phone", phone)
      .order("assigned_at", { ascending: false });

    return NextResponse.json({
      phone,
      tickets: {
        unused: unused ?? 0,
        used: used ?? 0,
        total: (unused ?? 0) + (used ?? 0),
      },
      codes: (codes ?? []).map((r) => ({
        code: r.code,
        last4: r.code.slice(-4),
        benefit_text: r.benefit_text,
        status: r.status,
        assigned_at: r.assigned_at,
      })),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "server error" },
      { status: 500 }
    );
  }
}
