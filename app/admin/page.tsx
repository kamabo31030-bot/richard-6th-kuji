"use client";

import { useState } from "react";

function normalizePhone(input: string) {
  return input.replace(/[^\d]/g, "");
}

type LookupRow = {
  code: string;
  benefit_text: string;
  assigned_at: string | null;
  status: string;
};

export default function AdminPage() {
  const [secret, setSecret] = useState("");

  // 付与
  const [phone, setPhone] = useState("");

  // コード操作（redeem / unredeem）
  const [code, setCode] = useState("");

  // 電話番号検索（未使用コード / 抽選権残数）
  const [lookupPhone, setLookupPhone] = useState("");
  const [lookupResults, setLookupResults] = useState<LookupRow[]>([]);
  const [ticketCount, setTicketCount] = useState<number | null>(null);

  const [msg, setMsg] = useState("");

  async function addTicket() {
    setMsg("");

    const p = normalizePhone(phone);
    if (!p) return setMsg("電話番号を入力してください");
    if (!secret) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/add-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, phone: p }),
    });

    const json = await res.json();
    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setMsg(`✅ 抽選権＋1 付与しました（${p}）`);
  }

  async function redeemCode() {
    setMsg("");

    const c = code.trim().toUpperCase();
    if (!c) return setMsg("コードを入力してください");
    if (!secret) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code: c }),
    });

    const json = await res.json();
    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setMsg(`✅ 使用済みにしました（${c}）`);
  }

  async function unredeemCode() {
    setMsg("");

    const c = code.trim().toUpperCase();
    if (!c) return setMsg("コードを入力してください");
    if (!secret) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/unredeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, code: c }),
    });

    const json = await res.json();
    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setMsg(`✅ 使用済みを戻しました（${c}）`);
  }

  async function lookupCodes() {
    setMsg("");
    setLookupResults([]);

    const p = normalizePhone(lookupPhone);
    if (!p) return setMsg("検索する電話番号を入力してください");
    if (!secret) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, phone: p }),
    });

    const json = await res.json();
    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setLookupResults(json.codes ?? []);
    setMsg(`✅ 未使用コードを表示しました（${p}）`);
  }

  async function lookupTicketCount() {
    setMsg("");
    setTicketCount(null);

    const p = normalizePhone(lookupPhone);
    if (!p) return setMsg("電話番号を入力してください");
    if (!secret) return setMsg("管理用合言葉を入力してください");

    const res = await fetch("/api/admin/ticket-count", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, phone: p }),
    });

    const json = await res.json();
    if (!res.ok) return setMsg(json?.error ?? "失敗");

    setTicketCount(json.count ?? 0);
    setMsg(`🎫 抽選権残数：${json.count ?? 0} 回（${p}）`);
  }

  return (
    <main style={{ padding: 40, maxWidth: 720 }}>
      <h1>管理ページ（6周年くじ）</h1>

      <div style={{ marginTop: 14 }}>
        <label>管理用合言葉（ADMIN_SECRET）</label>
        <input
          style={{ padding: 12, width: "100%", marginTop: 6 }}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="合言葉"
        />
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h2 style={{ fontSize: 16 }}>抽選権＋1（来店／口コミ）</h2>
      <input
        style={{ padding: 12, width: "100%", marginTop: 8 }}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="電話番号（例：090xxxxxxxx）"
      />
      <button style={{ marginTop: 10, padding: "10px 14px" }} onClick={addTicket}>
        抽選権＋1
      </button>

      <hr style={{ margin: "20px 0" }} />

      <h2 style={{ fontSize: 16 }}>コード管理</h2>
      <input
        style={{ padding: 12, width: "100%", marginTop: 8 }}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="短縮コード（例：2H8J）"
      />
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button style={{ padding: "10px 14px" }} onClick={redeemCode}>
          使用済みにする
        </button>
        <button style={{ padding: "10px 14px" }} onClick={unredeemCode}>
          使用済みを戻す
        </button>
      </div>

      <hr style={{ margin: "20px 0" }} />

      <h2 style={{ fontSize: 16 }}>電話番号で確認（客が忘れた時）</h2>
      <input
        style={{ padding: 12, width: "100%", marginTop: 8 }}
        value={lookupPhone}
        onChange={(e) => setLookupPhone(e.target.value)}
        placeholder="電話番号（例：070xxxxxxxx）"
      />

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={{ padding: "10px 14px" }} onClick={lookupCodes}>
          未使用コードを表示
        </button>
        <button style={{ padding: "10px 14px" }} onClick={lookupTicketCount}>
          抽選権残数を表示
        </button>
      </div>

      {ticketCount !== null && (
        <p style={{ marginTop: 12, fontSize: 14 }}>
          🎫 抽選権残数：<b>{ticketCount}</b> 回
        </p>
      )}

      {lookupResults.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid #ccc" }}>
          <div style={{ fontSize: 14, marginBottom: 10 }}>未使用コード一覧</div>
          <ul style={{ paddingLeft: 18 }}>
            {lookupResults.map((r) => (
              <li key={r.code} style={{ marginBottom: 10 }}>
                <div>{r.benefit_text}</div>
                <div style={{ fontFamily: "monospace", fontSize: 18 }}>
                  {r.code.slice(-4)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {msg && <p style={{ marginTop: 14 }}>{msg}</p>}

      <p style={{ marginTop: 18, opacity: 0.7 }}>
        ※URL：/admin（このページは合言葉がないと操作できません）
      </p>
    </main>
  );
}
