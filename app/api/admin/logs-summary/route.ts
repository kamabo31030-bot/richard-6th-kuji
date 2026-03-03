import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const admin = getAdminClient();

    const body = await req.json().catch(() => ({}));
    const secret = String(body?.secret ?? "").trim();
    const day = String(body?.day ?? "").trim(); // "YYYY-MM-DD" か空

    if (!secret || secret !== String(process.env.ADMIN_SECRET ?? "")) {
      return NextResponse.json({ error: "権限がありません" }, { status: 401 });
    }

    // day 未指定なら「今日（JST）」に寄せる
    // サーバーがUTCでもズレないように、JSTの年月日を生成
    const jstDay =
      day ||
      new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // RPC: logs_summary_by_day(p_day date)
    const { data, error } = await admin.rpc("logs_summary_by_day", {
      p_day: jstDay,
    });

    if (error) throw error;

    // returns table ... group by なので配列で返る（0 or 1想定）
    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      day: jstDay,
      ss: Number(row?.ss_count ?? 0),
      s: Number(row?.s_count ?? 0),
      a: Number(row?.a_count ?? 0),
      b: Number(row?.b_count ?? 0),
      total: Number(row?.total_count ?? 0),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "サーバーエラー" },
      { status: 500 }
    );
  }
}
