"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

type LookupRow = {
  code: string;
  benefit_text: string;
  assigned_at: string | null;
  status: string;
};

type Stock = {
  ss: number;
  s: number;
  a: number;
  b: number;
  total: number;
};

function safeLast4(code: string) {
  const s = (code ?? "").trim();
  return s.length >= 4 ? s.slice(-4).toUpperCase() : s.toUpperCase();
}

export default function AdminPage() {
  const [secret, setSecret] = useState("");

  // 付与
  const [phone, setPhone] = useState("");
  const phoneRef = useRef<HTMLInputElement | null>(null);

  // コード操作（redeem / unredeem）
  const [code, setCode] = useState("");

  // 電話番号検索（未使用コード / 抽選権残数）
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupRow[]>([]);
  const [ticketCount, setTicketCount] = useState<number | null>(null);

  // 在庫
  const [stock, setStock] = useState<Stock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  const [msg, setMsg] = useState("");

  const secretTrimmed = useMemo(() => secret.trim(), [secret]);

  async function addTicket() {
    setMsg("");

    const p = normalizePhone(phone);
    if (!p) return setMsg("電話番号を入力してください");
    if (!secretTrimmed) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/add-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretTrimmed, phone: p }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) return setMsg(json?.error ?? "失敗");

    // ✅ 電話番号は消さない。連続入力しやすくする
    setMsg(`✅ 抽選権＋1 付与しました（${p}）`);
    requestAnimationFrame(() => {
      phoneRef.current?.focus();
      phoneRef.current?.select();
    });
  }

  async function redeemCode() {
    setMsg("");

    const c = code.trim().toUpperCase();
    if (!c) return setMsg("コードを入力してください");
    if (!secretTrimmed) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretTrimmed, code: c }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setMsg(`✅ 使用済みにしました（${c}）`);
  }

  async function unredeemCode() {
    setMsg("");

    const c = code.trim().toUpperCase();
    if (!c) return setMsg("コードを入力してください");
    if (!secretTrimmed) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/unredeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretTrimmed, code: c }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setMsg(`✅ 使用済みを戻しました（${c}）`);
  }

  async function lookupCodes() {
    setMsg("");
    setLookupResults([]);

    const p = normalizePhone(lookupPhone);
    if (!p) return setMsg("検索する電話番号を入力してください");
    if (!secretTrimmed) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretTrimmed, phone: p }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setLookupResults(json.codes ?? []);
    setMsg(`✅ 未使用コードを表示しました（${p}）`);
  }

  async function lookupTicketCount() {
    setMsg("");
    setTicketCount(null);

    const p = normalizePhone(lookupPhone);
    if (!p) return setMsg("電話番号を入力してください");
    if (!secretTrimmed) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/ticket-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: secretTrimmed, phone: p }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setTicketCount(json.count ?? 0);
    setMsg(`🎫 抽選権残数：${json.count ?? 0} 回（${p}）`);
  }

  async function fetchStock() {
    if (!secretTrimmed) return;

    setStockLoading(true);
    try {
      const res = await fetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: secretTrimmed }),
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setMsg(json?.error ?? "在庫取得に失敗");
        setStock(null);
        return;
      }

      // 期待: { ss, s, a, b, total }
      setStock({
        ss: Number(json.ss ?? 0),
        s: Number(json.s ?? 0),
        a: Number(json.a ?? 0),
        b: Number(json.b ?? 0),
        total: Number(json.total ?? 0),
      });
    } finally {
      setStockLoading(false);
    }
  }

  // ✅ 合言葉を入れたら自動的に在庫を取得（打鍵ごとに連打しないように軽く遅延）
  useEffect(() => {
    setStock(null);
    if (!secretTrimmed) return;

    const t = setTimeout(() => {
      fetchStock();
    }, 450);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secretTrimmed]);

  const styles = {
    page: {
      minHeight: "100vh",
      padding: 28,
      background:
        "radial-gradient(1200px 700px at 15% 10%, rgba(99,102,241,0.16), transparent 60%), radial-gradient(900px 600px at 85% 0%, rgba(236,72,153,0.14), transparent 55%), linear-gradient(180deg, #0b0b11, #0b0b11)",
      color: "#fff",
      fontFamily:
        'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif',
    } as const,
    container: {
      maxWidth: 860,
      margin: "0 auto",
    } as const,
    headerCard: {
      padding: 18,
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.06)",
      boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
      backdropFilter: "blur(10px)",
    } as const,
    h1: {
      margin: 0,
      fontSize: 22,
      letterSpacing: 0.2,
    } as const,
    sub: {
      marginTop: 6,
      opacity: 0.75,
      fontSize: 13,
      lineHeight: 1.6,
    } as const,
    grid: {
      marginTop: 16,
      display: "grid",
      gridTemplateColumns: "1fr",
      gap: 14,
    } as const,
    card: {
      padding: 16,
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.05)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
      backdropFilter: "blur(8px)",
    } as const,
    titleRow: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: 12,
    } as const,
    h2: {
      margin: 0,
      fontSize: 15,
      opacity: 0.95,
    } as const,
    badge: {
      fontSize: 12,
      padding: "4px 8px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.08)",
      opacity: 0.9,
      whiteSpace: "nowrap",
    } as const,
    label: {
      display: "block",
      fontSize: 12,
      opacity: 0.75,
      marginBottom: 6,
    } as const,
    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.25)",
      color: "#fff",
      outline: "none",
    } as const,
    row: {
      display: "flex",
      gap: 10,
      flexWrap: "wrap",
      marginTop: 10,
    } as const,
    btn: {
      padding: "10px 14px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.10)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 600,
    } as const,
    btnPrimary: {
      padding: "10px 14px",
      borderRadius: 12,
      border: "1px solid rgba(99,102,241,0.55)",
      background: "rgba(99,102,241,0.25)",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 700,
    } as const,
    msg: {
      marginTop: 14,
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.25)",
      lineHeight: 1.6,
      fontSize: 13,
      opacity: 0.95,
      whiteSpace: "pre-wrap" as const,
    },
    stockGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
      gap: 10,
      marginTop: 10,
    } as const,
    stockBox: {
      padding: "10px 10px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(0,0,0,0.22)",
      textAlign: "center" as const,
    } as const,
    stockK: {
      fontSize: 12,
      opacity: 0.75,
      marginBottom: 2,
    } as const,
    stockV: {
      fontSize: 18,
      fontWeight: 800,
      letterSpacing: 0.2,
    } as const,
    small: {
      marginTop: 12,
      opacity: 0.65,
      fontSize: 12,
      lineHeight: 1.6,
    } as const,
  };

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerCard}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h1 style={styles.h1}>管理ページ（6周年くじ）</h1>
              <div style={styles.sub}>
                合言葉を入れると <b>在庫が自動表示</b>されます。<br />
                ※URL：/admin（このページは合言葉がないと操作できません）
              </div>
            </div>

            <div style={{ minWidth: 300, flex: "1 1 320px" }}>
              <label style={styles.label}>管理用合言葉（ADMIN_SECRET）</label>
              <input
                style={styles.input}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="合言葉"
                autoComplete="off"
                spellCheck={false}
              />
              <div style={{ marginTop: 10, opacity: 0.85, fontSize: 12 }}>
                {secretTrimmed ? (
                  stockLoading ? (
                    <span>📦 在庫を取得中…</span>
                  ) : stock ? (
                    <span>📦 在庫表示中</span>
                  ) : (
                    <span>📦 在庫：未取得</span>
                  )
                ) : (
                  <span>📦 合言葉を入れると在庫が出ます</span>
                )}
              </div>

              {secretTrimmed && (
                <div style={styles.stockGrid}>
                  <div style={styles.stockBox}>
                    <div style={styles.stockK}>SS</div>
                    <div style={styles.stockV}>{stock?.ss ?? "-"}</div>
                  </div>
                  <div style={styles.stockBox}>
                    <div style={styles.stockK}>S</div>
                    <div style={styles.stockV}>{stock?.s ?? "-"}</div>
                  </div>
                  <div style={styles.stockBox}>
                    <div style={styles.stockK}>A</div>
                    <div style={styles.stockV}>{stock?.a ?? "-"}</div>
                  </div>
                  <div style={styles.stockBox}>
                    <div style={styles.stockK}>B</div>
                    <div style={styles.stockV}>{stock?.b ?? "-"}</div>
                  </div>
                  <div style={styles.stockBox}>
                    <div style={styles.stockK}>TOTAL</div>
                    <div style={styles.stockV}>{stock?.total ?? "-"}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {msg && <div style={styles.msg}>{msg}</div>}
        </div>

        <div style={styles.grid}>
          {/* 抽選権＋1 */}
          <section style={styles.card}>
            <div style={styles.titleRow}>
              <h2 style={styles.h2}>抽選権＋1（来店／口コミ）</h2>
              <span style={styles.badge}>連続入力OK</span>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>電話番号</label>
              <input
                ref={phoneRef}
                style={styles.input}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="電話番号（例：090xxxxxxxx）"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>

            <div style={styles.row}>
              <button type="button" style={styles.btnPrimary} onClick={addTicket}>
                抽選権＋1
              </button>
            </div>
          </section>

          {/* コード管理 */}
          <section style={styles.card}>
            <div style={styles.titleRow}>
              <h2 style={styles.h2}>コード管理</h2>
              <span style={styles.badge}>4桁入力でもOK</span>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>短縮コード（末尾4文字でもOK）</label>
              <input
                style={styles.input}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="短縮コード（例：2H8J）または 全コード"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>

            <div style={styles.row}>
              <button type="button" style={styles.btnPrimary} onClick={redeemCode}>
                使用済みにする
              </button>
              <button type="button" style={styles.btn} onClick={unredeemCode}>
                使用済みを戻す
              </button>
            </div>
          </section>

          {/* 電話番号で確認 */}
          <section style={styles.card}>
            <div style={styles.titleRow}>
              <h2 style={styles.h2}>電話番号で確認（客が忘れた時）</h2>
              <span style={styles.badge}>未使用コード／抽選権残数</span>
            </div>

            <div style={{ marginTop: 10 }}>
              <label style={styles.label}>電話番号</label>
              <input
                style={styles.input}
                value={lookupPhone}
                onChange={(e) => setLookupPhone(e.target.value)}
                placeholder="電話番号（例：070xxxxxxxx）"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>

            <div style={styles.row}>
              <button type="button" style={styles.btnPrimary} onClick={lookupCodes}>
                未使用コードを表示
              </button>
              <button type="button" style={styles.btn} onClick={lookupTicketCount}>
                抽選権残数を表示
              </button>
              <button
                type="button"
                style={styles.btn}
                onClick={() => {
                  setMsg("");
                  fetchStock();
                }}
              >
                在庫を手動更新
              </button>
            </div>

            {ticketCount !== null && (
              <div style={{ marginTop: 12, fontSize: 13, opacity: 0.95 }}>
                🎫 抽選権残数：<b>{ticketCount}</b> 回
              </div>
            )}

            {lookupResults.length > 0 && (
              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.22)",
                }}
              >
                <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 10 }}>
                  未使用コード一覧
                </div>

                <ul style={{ paddingLeft: 18, margin: 0 }}>
                  {lookupResults.map((r) => (
                    <li key={r.code} style={{ marginBottom: 12 }}>
                      <div style={{ opacity: 0.9 }}>{r.benefit_text}</div>
                      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 20, fontWeight: 800 }}>
                        {safeLast4(r.code)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={styles.small}>
              ・合言葉を入力すると在庫は自動取得（反映が遅い時は「在庫を手動更新」）<br />
              ・表示は “末尾4文字” だけ見せる仕様（コード全部を見せなくてOK）
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
