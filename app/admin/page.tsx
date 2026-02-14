"use client";

import { useEffect, useMemo, useRef, useState } from "react";

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}

function normalizeCode(input: string) {
  const s = (input ?? "").trim().toUpperCase();
  return s.replace(/[^A-Z0-9-]/g, "");
}

async function safeJson(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

type Stock = { ss: number; s: number; a: number; b: number; total: number };

type UserCode = {
  code: string;
  rank?: string | null;
  benefit_text?: string | null;
  status?: string | null; // ← ここが重要
  assigned_at?: string | null;
  used_at?: string | null; // used_at / redeemed_at のどっちでも拾う
};

type UserInfo = {
  phone: string | null;
  tickets?: any;
  codes: UserCode[];
  query: string;
};

export default function AdminPage() {
  // 合言葉
  const [secret, setSecret] = useState("");

  // 在庫
  const [stock, setStock] = useState<Stock | null>(null);
  const [stockLoading, setStockLoading] = useState(false);

  // 抽選権（付与/取消）
  const [phone, setPhone] = useState("");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketCountNow, setTicketCountNow] = useState<number | null>(null);

  // ユーザー検索（電話 or コード）
  const [query, setQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);

  // メッセージ
  const [msg, setMsg] = useState("");

  const canOperate = useMemo(() => secret.trim().length > 0, [secret]);

  const stockDebounceRef = useRef<number | null>(null);

  // ✅ ここだけ直した（used_at だけじゃなく status も見る）
  function isUsedRow(row: UserCode) {
    const st = String(row.status ?? "").toLowerCase().trim();
    // 代表的な「使用済」表現を全部吸収
    const usedByStatus =
      st === "used" ||
      st === "redeemed" ||
      st === "consumed" ||
      st === "done" ||
      st === "used_up" ||
      st === "used-out";
    const usedByTimestamp = !!row.used_at;
    return usedByStatus || usedByTimestamp;
  }

  function statusLabel(row: UserCode) {
    return isUsedRow(row) ? "使用済" : "未使用";
  }

  function short4(code: string) {
    const c = (code ?? "").toUpperCase();
    const m = c.match(/([A-Z0-9]{4})$/);
    return m ? m[1] : c.slice(-4);
  }

  // ===== 在庫取得 =====
  async function fetchStock(opts?: { silentMsg?: boolean }) {
    if (!canOperate) {
      setStock(null);
      return;
    }

    setStockLoading(true);
    if (!opts?.silentMsg) setMsg("");

    try {
      const res = await fetch("/api/admin/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "在庫取得に失敗しました");

      const st: Stock = {
        ss: Number(json?.ss ?? 0),
        s: Number(json?.s ?? 0),
        a: Number(json?.a ?? 0),
        b: Number(json?.b ?? 0),
        total: Number(json?.total ?? 0),
      };
      setStock(st);

      if (!opts?.silentMsg) setMsg("✅ 在庫を更新しました");
    } catch (e: any) {
      setStock(null);
      setMsg(e?.message ?? "在庫取得に失敗しました");
    } finally {
      setStockLoading(false);
    }
  }

  // 合言葉入力で自動的に在庫表示（軽くデバウンス）
  useEffect(() => {
    if (stockDebounceRef.current) window.clearTimeout(stockDebounceRef.current);
    stockDebounceRef.current = window.setTimeout(() => {
      fetchStock({ silentMsg: true });
    }, 300);

    return () => {
      if (stockDebounceRef.current) window.clearTimeout(stockDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secret]);

  // ===== 抽選権残数取得 =====
  async function fetchTicketCount(p: string, opts?: { silentMsg?: boolean }) {
    if (!canOperate) return;

    try {
      const res = await fetch("/api/admin/ticket-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, phone: p }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "残数取得に失敗しました");

      const c = Number(json?.count ?? 0);
      setTicketCountNow(c);
      if (!opts?.silentMsg) setMsg(`🎫 抽選権残数：${c} 回（${p}）`);
    } catch (e: any) {
      setTicketCountNow(null);
      if (!opts?.silentMsg) setMsg(e?.message ?? "残数取得に失敗しました");
    }
  }

  // ===== 抽選権 +1 =====
  async function addTicket() {
    setMsg("");
    const p = normalizePhone(phone);
    if (!p) return setMsg("電話番号を入力してください");
    if (!canOperate) return setMsg("管理用合言葉を入力してください");

    setTicketBusy(true);
    try {
      const res = await fetch("/api/admin/add-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, phone: p }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "付与に失敗しました");

      await fetchTicketCount(p, { silentMsg: true });
      setMsg(`✅ 抽選権＋1 付与しました（${p}）  現在：${ticketCountNow ?? "?"} 回`);
    } catch (e: any) {
      setMsg(e?.message ?? "付与に失敗しました");
    } finally {
      setTicketBusy(false);
    }
  }

  // ===== 抽選権 -1（取消）=====
  async function removeTicket() {
    setMsg("");
    const p = normalizePhone(phone);
    if (!p) return setMsg("電話番号を入力してください");
    if (!canOperate) return setMsg("管理用合言葉を入力してください");

    setTicketBusy(true);
    try {
      const res = await fetch("/api/admin/remove-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, phone: p }),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "取消に失敗しました");

      await fetchTicketCount(p, { silentMsg: true });
      setMsg(`✅ 付与を取り消しました（${p}）  現在：${ticketCountNow ?? "?"} 回`);
    } catch (e: any) {
      setMsg(e?.message ?? "取消に失敗しました");
    } finally {
      setTicketBusy(false);
    }
  }

  // ===== ユーザー検索（電話 or コード）=====
  async function searchUser(q?: string, opts?: { silentMsg?: boolean }) {
    const raw = (q ?? query ?? "").trim();
    setUser(null);

    if (!raw) {
      setMsg("電話番号 or コードを入力してください");
      return;
    }
    if (!canOperate) {
      setMsg("管理用合言葉を入力してください");
      return;
    }

    setSearchLoading(true);
    if (!opts?.silentMsg) setMsg("");

    try {
      const phoneQ = normalizePhone(raw);
      const codeQ = normalizeCode(raw);

      const payload: any = {
        secret,
        query: raw,
        q: raw,
        phone: phoneQ || undefined,
        code: codeQ || undefined,
        last4: codeQ.length === 4 ? codeQ : undefined,
        short: codeQ.length === 4 ? codeQ : undefined,
      };

      const res = await fetch("/api/admin/user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "検索に失敗しました");

      const detectedPhone =
        json?.phone ??
        json?.user?.phone ??
        json?.data?.phone ??
        json?.result?.phone ??
        payload.phone ??
        null;

      const tickets =
        json?.tickets ??
        json?.user?.tickets ??
        json?.data?.tickets ??
        json?.result?.tickets ??
        (typeof json?.ticketCount === "number"
          ? { unused: json.ticketCount, total: json.ticketCount }
          : null);

      const rawCodes =
        json?.codes ??
        json?.prize_codes ??
        json?.prizeCodes ??
        json?.rows ??
        json?.data?.codes ??
        json?.data?.prize_codes ??
        json?.data?.prizeCodes ??
        json?.result?.codes ??
        json?.result?.prize_codes ??
        json?.data ??
        json?.result ??
        [];

      const arr = Array.isArray(rawCodes) ? rawCodes : [];

      const codesNormalized: UserCode[] = arr
        .map((r: any) => ({
          code: r.code ?? r.prize_code ?? r.prizeCode ?? "",
          rank: r.rank ?? r.tier ?? r.grade ?? null,
          benefit_text: r.benefit_text ?? r.benefitText ?? r.text ?? r.name ?? "",
          status: r.status ?? null,
          assigned_at: r.assigned_at ?? r.assignedAt ?? null,
          used_at: r.used_at ?? r.usedAt ?? r.redeemed_at ?? r.redeemedAt ?? null,
        }))
        .filter((x: any) => x.code);

      setUser({
        phone: detectedPhone,
        tickets: tickets ?? undefined,
        codes: codesNormalized,
        query: raw,
      });

      if (!opts?.silentMsg) setMsg(`✅ 検索しました（${raw}）`);
    } catch (e: any) {
      setUser(null);
      setMsg(e?.message ?? "検索に失敗しました");
    } finally {
      setSearchLoading(false);
    }
  }

  // ===== コードを使用済みにする / 未使用に戻す =====
  async function markUsed(code: string) {
    if (!canOperate) return setMsg("管理用合言葉を入力してください");
    setMsg("");
    const c = normalizeCode(code);
    if (!c) return setMsg("コードが不正です");

    try {
      const res = await fetch("/api/admin/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code: c }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "失敗");

      await searchUser(user?.query ?? query, { silentMsg: true });
      await fetchStock({ silentMsg: true });
      setMsg(`✅ 使用済みにしました（${short4(c)}）`);
    } catch (e: any) {
      setMsg(e?.message ?? "失敗");
    }
  }

  async function markUnused(code: string) {
    if (!canOperate) return setMsg("管理用合言葉を入力してください");
    setMsg("");
    const c = normalizeCode(code);
    if (!c) return setMsg("コードが不正です");

    try {
      const res = await fetch("/api/admin/unredeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, code: c }),
      });
      const json = await safeJson(res);
      if (!res.ok) throw new Error(json?.error ?? "失敗");

      await searchUser(user?.query ?? query, { silentMsg: true });
      await fetchStock({ silentMsg: true });
      setMsg(`✅ 未使用に戻しました（${short4(c)}）`);
    } catch (e: any) {
      setMsg(e?.message ?? "失敗");
    }
  }

  // ===== スタイル（青黒UI）=====
  const styles = {
    page: {
      minHeight: "100vh",
      padding: "28px 18px 60px",
      background:
        "radial-gradient(1200px 600px at 20% 0%, rgba(30,58,138,0.25), transparent 55%)," +
        "radial-gradient(900px 500px at 85% 10%, rgba(59,130,246,0.15), transparent 55%)," +
        "linear-gradient(180deg, #050b16 0%, #030712 60%, #020617 100%)",
      color: "#e5e7eb",
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial',
    } as React.CSSProperties,
    container: {
      maxWidth: 980,
      margin: "0 auto",
    } as React.CSSProperties,
    headerRow: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    } as React.CSSProperties,
    title: {
      fontSize: 26,
      fontWeight: 800,
      letterSpacing: 0.2,
      margin: 0,
    } as React.CSSProperties,
    subtitle: { marginTop: 6, opacity: 0.75, fontSize: 13 } as React.CSSProperties,
    btn: {
      background: "rgba(59,130,246,0.9)",
      border: "1px solid rgba(59,130,246,0.35)",
      color: "#fff",
      padding: "10px 14px",
      borderRadius: 12,
      fontWeight: 700,
      cursor: "pointer",
    } as React.CSSProperties,
    btnGhost: {
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.10)",
      color: "#e5e7eb",
      padding: "10px 14px",
      borderRadius: 12,
      fontWeight: 700,
      cursor: "pointer",
    } as React.CSSProperties,
    btnDanger: {
      background: "rgba(239,68,68,0.22)",
      border: "1px solid rgba(239,68,68,0.35)",
      color: "#fecaca",
      padding: "10px 14px",
      borderRadius: 12,
      fontWeight: 800,
      cursor: "pointer",
    } as React.CSSProperties,
    card: {
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)",
      border: "1px solid rgba(148,163,184,0.18)",
      borderRadius: 18,
      boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
      padding: 16,
    } as React.CSSProperties,
    input: {
      width: "100%",
      padding: "12px 12px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.22)",
      background: "rgba(2,6,23,0.45)",
      color: "#e5e7eb",
      outline: "none",
      fontSize: 14,
    } as React.CSSProperties,
    label: { fontSize: 12, opacity: 0.8, marginBottom: 6 } as React.CSSProperties,
    grid2: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 14,
      marginTop: 14,
    } as React.CSSProperties,
    grid4: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 12,
      marginTop: 12,
    } as React.CSSProperties,
    stat: {
      background: "rgba(2,6,23,0.35)",
      border: "1px solid rgba(148,163,184,0.18)",
      borderRadius: 14,
      padding: 12,
    } as React.CSSProperties,
    statLabel: { fontSize: 12, opacity: 0.75 } as React.CSSProperties,
    statValue: { fontSize: 22, fontWeight: 900, marginTop: 6 } as React.CSSProperties,
    table: {
      width: "100%",
      borderCollapse: "separate",
      borderSpacing: 0,
      overflow: "hidden",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.18)",
    } as React.CSSProperties,
    th: {
      textAlign: "left",
      fontSize: 12,
      opacity: 0.85,
      padding: "10px 12px",
      background: "rgba(2,6,23,0.6)",
      borderBottom: "1px solid rgba(148,163,184,0.18)",
    } as React.CSSProperties,
    td: {
      padding: "10px 12px",
      borderBottom: "1px solid rgba(148,163,184,0.12)",
      verticalAlign: "top",
      fontSize: 13,
    } as React.CSSProperties,
    pill: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(148,163,184,0.18)",
      background: "rgba(255,255,255,0.05)",
      fontSize: 12,
    } as React.CSSProperties,
    msg: {
      marginTop: 12,
      padding: "12px 14px",
      borderRadius: 14,
      border: "1px solid rgba(148,163,184,0.18)",
      background: "rgba(2,6,23,0.55)",
      fontSize: 13,
      whiteSpace: "pre-wrap",
    } as React.CSSProperties,
    small: { fontSize: 12, opacity: 0.75 } as React.CSSProperties,
  };

  const userTicketsUnused = useMemo(() => {
    if (!user?.tickets) return null;
    if (typeof user.tickets === "number") return user.tickets;
    if (typeof user.tickets?.unused === "number") return user.tickets.unused;
    if (typeof user.tickets?.count === "number") return user.tickets.count;
    return null;
  }, [user]);

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>管理ページ</h1>
            <div style={styles.subtitle}>合言葉を入力すると在庫が自動表示されます</div>
          </div>
          <button
            style={styles.btnGhost}
            onClick={() => fetchStock()}
            disabled={!canOperate || stockLoading}
            title="在庫を手動更新"
          >
            {stockLoading ? "更新中..." : "在庫を更新"}
          </button>
        </div>

        {/* 合言葉 + 在庫 */}
        <div style={styles.card}>
          <div style={styles.label}>管理用合言葉（ADMIN_SECRET）</div>
          <input
            style={styles.input}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="合言葉"
          />

          <div style={styles.grid4}>
            <div style={styles.stat}>
              <div style={styles.statLabel}>SS</div>
              <div style={styles.statValue}>{stock?.ss ?? "-"}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statLabel}>S</div>
              <div style={styles.statValue}>{stock?.s ?? "-"}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statLabel}>A</div>
              <div style={styles.statValue}>{stock?.a ?? "-"}</div>
            </div>
            <div style={styles.stat}>
              <div style={styles.statLabel}>B</div>
              <div style={styles.statValue}>{stock?.b ?? "-"}</div>
            </div>
          </div>

          <div style={{ ...styles.stat, marginTop: 12 }}>
            <div style={styles.statLabel}>合計（未使用）</div>
            <div style={styles.statValue}>{stock?.total ?? "-"}</div>
          </div>
        </div>

        {/* 操作エリア */}
        <div style={styles.grid2}>
          {/* 抽選権 */}
          <div style={styles.card}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
              抽選権管理
            </div>

            <div style={styles.label}>電話番号</div>
            <input
              style={styles.input}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="電話番号（例：090xxxxxxxx）"
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                style={styles.btn}
                onClick={addTicket}
                disabled={!canOperate || ticketBusy}
              >
                ＋付与
              </button>
              <button
                style={styles.btnDanger}
                onClick={removeTicket}
                disabled={!canOperate || ticketBusy}
              >
                取消（-1）
              </button>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  const p = normalizePhone(phone);
                  if (!p) return setMsg("電話番号を入力してください");
                  fetchTicketCount(p);
                }}
                disabled={!canOperate || ticketBusy}
              >
                現在の回数
              </button>
            </div>

            {ticketCountNow !== null && (
              <div style={{ marginTop: 10, ...styles.pill }}>
                🎫 抽選権残数：<b>{ticketCountNow}</b> 回
              </div>
            )}

            <div style={{ marginTop: 10, ...styles.small }}>
              ※入力は消えません（連続入力OK）
            </div>
          </div>

          {/* ユーザー検索 */}
          <div style={styles.card}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>
              ユーザー検索（電話 or コード）
            </div>

            <div style={styles.label}>電話番号 or コード</div>
            <input
              style={styles.input}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="例：070xxxxxxxx / 6TH-XXXX / XXXX"
              onKeyDown={(e) => {
                if (e.key === "Enter") searchUser();
              }}
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                style={styles.btn}
                onClick={() => searchUser()}
                disabled={!canOperate || searchLoading}
              >
                {searchLoading ? "検索中..." : "検索"}
              </button>
              <button
                style={styles.btnGhost}
                onClick={() => {
                  setUser(null);
                  setMsg("");
                }}
              >
                クリア
              </button>
            </div>

            {user?.phone && (
              <div style={{ marginTop: 10, ...styles.pill }}>
                👤 電話：<b>{user.phone}</b>
                {userTicketsUnused !== null && (
                  <>
                    <span style={{ opacity: 0.6 }}>／</span>
                    🎫 残数：<b>{userTicketsUnused}</b>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* コード一覧 */}
        <div style={{ ...styles.card, marginTop: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 8 }}>コード一覧</div>
          <div style={{ ...styles.small, marginBottom: 10 }}>
            検索するとここに一覧が出ます（assigned は表示せず「未使用/使用済」で表示）
          </div>

          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>コード（4桁）</th>
                <th style={styles.th}>景品</th>
                <th style={styles.th}>状態</th>
                <th style={styles.th}>操作</th>
              </tr>
            </thead>
            <tbody>
              {user?.codes?.length ? (
                user.codes.map((r) => {
                  const label = statusLabel(r);
                  const isUsed = label === "使用済"; // ← statusも反映される
                  return (
                    <tr key={r.code}>
                      <td style={styles.td}>
                        <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          <b style={{ fontSize: 16 }}>{short4(r.code)}</b>
                        </div>
                        <div style={{ ...styles.small, marginTop: 4, opacity: 0.7 }}>
                          {r.rank ? `rank: ${String(r.rank).toUpperCase()}` : ""}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>
                          {r.benefit_text ?? ""}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.pill}>
                          {isUsed ? "✅ 使用済" : "🟦 未使用"}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            style={styles.btn}
                            onClick={() => markUsed(r.code)}
                            disabled={!canOperate}
                          >
                            使用済みにする
                          </button>
                          <button
                            style={styles.btnGhost}
                            onClick={() => markUnused(r.code)}
                            disabled={!canOperate}
                          >
                            未使用に戻す
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td style={styles.td} colSpan={4}>
                    該当ユーザーなし / コードなし
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: 12, ...styles.small }}>
            ※URL：/admin（このページは合言葉がないと操作できません）
          </div>
        </div>

        {msg && <div style={styles.msg}>{msg}</div>}
      </div>
    </main>
  );
}
