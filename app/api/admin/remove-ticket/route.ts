import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function getAdminClient() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret = (body?.secret ?? "").toString();
    const phone = normalizePhone(body?.phone);

    if (!secret) {
      return NextResponse.json({ error: "管理用合言葉を入力してください" }, { status: 400 });
    }
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: "合言葉が違います" }, { status: 401 });
    }
    if (!phone) {
      return NextResponse.json({ error: "電話番号を入力してください" }, { status: 400 });
    }

    const admin = getAdminClient();
    const nowIso = new Date().toISOString();

    // ✅ 取り消し対象：未使用 & 期限内のチケットを「最新の1枚」だけ
    const { data: ticket, error: tErr } = await admin
      .from("draw_tickets")
      .select("id")
      .eq("phone", phone)
      .eq("status", "unused")
      .gte("expires_at", nowIso)
      .order("created_at", { ascending: false }) // 最新を消す
      .limit(1)
      .maybeSingle();

    if (tErr) throw tErr;

    if (!ticket?.id) {
      return NextResponse.json(
        { error: "取り消せる抽選権がありません（未使用 or 期限内が0件）" },
        { status: 400 }
      );
    }

    // ✅ 1枚だけ削除（取り消し）
    const { error: dErr } = await admin.from("draw_tickets").delete().eq("id", ticket.id);
    if (dErr) throw dErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "サーバーエラー" }, { status: 500 });
  }
}
