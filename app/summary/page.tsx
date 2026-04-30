import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Rank = "s" | "a" | "b";

const rankLabel: Record<Rank, string> = {
  s: "S賞",
  a: "A賞",
  b: "B賞",
};

const priceMap: Record<Rank, number> = {
  s: 3000,
  a: 2000,
  b: 1000,
};

export default async function SummaryPage() {
  let errorMessage = "";

  let winMap: Record<Rank, number> = { s: 0, a: 0, b: 0 };
  let redeemedMap: Record<Rank, number> = { s: 0, a: 0, b: 0 };

  try {
    const { data: logs, error: logErr } = await supabase
      .from("draw_logs")
      .select("rank");

    if (logErr) throw logErr;

    for (const row of logs ?? []) {
      const r = row.rank as Rank;
      if (winMap[r] !== undefined) winMap[r]++;
    }

    const { data: redeemedCodes, error: redeemedErr } = await supabase
      .from("prize_codes")
      .select("rank")
      .eq("status", "redeemed");

    if (redeemedErr) throw redeemedErr;

    for (const row of redeemedCodes ?? []) {
      const r = row.rank as Rank;
      if (redeemedMap[r] !== undefined) redeemedMap[r]++;
    }
  } catch (e: any) {
    errorMessage = e?.message ?? "取得失敗";
  }

  const rows = (["s", "a", "b"] as Rank[]).map((r) => {
    const win = winMap[r];
    const used = redeemedMap[r];
    const rate = win === 0 ? 0 : Math.round((used / win) * 100);
    const amount = used * priceMap[r];

    return {
      label: rankLabel[r],
      win,
      used,
      rate,
      unitPrice: priceMap[r],
      amount,
    };
  });

  const totalWin = rows.reduce((sum, r) => sum + r.win, 0);
  const totalUsed = rows.reduce((sum, r) => sum + r.used, 0);
  const totalRate = totalWin === 0 ? 0 : Math.round((totalUsed / totalWin) * 100);
  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <main
      style={{
        padding: 20,
        fontFamily: "sans-serif",
        background: "#0b0b0b",
        minHeight: "100vh",
        color: "#fff",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: "bold" }}>くじ使用状況</h1>

      {errorMessage && (
        <div
          style={{
            color: "#ff6b6b",
            marginTop: 16,
            padding: 12,
            border: "1px solid #7f1d1d",
            borderRadius: 10,
            background: "#2a0f0f",
          }}
        >
          {errorMessage}
        </div>
      )}

      {!errorMessage && (
        <>
          <div style={{ marginTop: 20, marginBottom: 30 }}>
            <div style={{ fontSize: 18, marginBottom: 6 }}>総当選数：{totalWin}</div>
            <div style={{ fontSize: 18, marginBottom: 6 }}>総使用数：{totalUsed}</div>
            <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 14 }}>
              総額：{totalAmount.toLocaleString()}円
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>消化率：{totalRate}%</div>
              <div style={{ height: 10, background: "#333", borderRadius: 6 }}>
                <div
                  style={{
                    width: `${totalRate}%`,
                    height: "100%",
                    background: "#22c55e",
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {rows.map((r) => (
              <div
                key={r.label}
                style={{
                  padding: 16,
                  borderRadius: 12,
                  background: "#1a1a1a",
                  border: "1px solid #333",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: "bold" }}>{r.label}</div>
                  <div style={{ fontSize: 15, color: "#cfcfcf" }}>
                    {r.unitPrice.toLocaleString()}円 / 件
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 15 }}>
                  当選：{r.win} / 使用：{r.used}
                </div>

                <div style={{ marginTop: 6, fontSize: 16, fontWeight: "bold" }}>
                  金額：{r.amount.toLocaleString()}円
                </div>

                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>使用率：{r.rate}%</div>

                  <div style={{ height: 8, background: "#333", borderRadius: 6 }}>
                    <div
                      style={{
                        width: `${r.rate}%`,
                        height: "100%",
                        background:
                          r.rate > 70 ? "#ef4444" : r.rate > 30 ? "#f59e0b" : "#22c55e",
                        borderRadius: 6,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}