"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

function normalizePhone(input: string) {
  return (input ?? "").replace(/[^\d]/g, "");
}
function short(code: string) {
  return (code ?? "").slice(-4).toUpperCase();
}
function spinText() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

type CodeRow = { code: string; benefit_text: string };
type DrawResult = { code: string; benefit_text: string };

type FxKind = "ss" | "s" | "a" | "b" | null;

type Spark = {
  id: string;
  left: number;
  top: number;
  delay: number;
  dur: number;
  scale: number;
  rot: number;
  opacity: number;
};

function toHalfWidthAlphaNum(str: string) {
  return (str ?? "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}
function normalizeTextForRank(str: string) {
  let s = str ?? "";
  s = toHalfWidthAlphaNum(s);
  s = s.replace(/，/g, ",").replace(/．/g, ".").replace(/－/g, "-");
  s = s.replace(/\s+/g, "");
  return s.toLowerCase();
}

/**
 * ✅Rank判定（事故らない版）
 * 優先順位：
 * 1) benefit_text の先頭に「SS賞/S賞/A賞/B賞」がある → それだけで決める
 * 2) なければ、コードの先頭（SS... / S... / A... / B...）で決める
 * ※ 金額/半額などの推測は一切しない（全部SS化・全部B化の事故を防ぐ）
 */
function detectRank(benefitText: string, code?: string): FxKind {
  const t = normalizeTextForRank(benefitText ?? "");
  const raw = (code ?? "").toUpperCase();

  // 1) benefit_text 先頭ラベル
  if (
    t.startsWith("ss賞") ||
    t.startsWith("ss:") ||
    t.startsWith("ss：") ||
    t.startsWith("ss-") ||
    t.startsWith("ss_")
  )
    return "ss";
  if (t.startsWith("s賞") || t.startsWith("s:") || t.startsWith("s：") || t.startsWith("s-") || t.startsWith("s_"))
    return "s";
  if (t.startsWith("a賞") || t.startsWith("a:") || t.startsWith("a：") || t.startsWith("a-") || t.startsWith("a_"))
    return "a";
  if (t.startsWith("b賞") || t.startsWith("b:") || t.startsWith("b：") || t.startsWith("b-") || t.startsWith("b_"))
    return "b";

  // 先頭じゃないけど入ってる（救済）
  if (t.includes("ss賞")) return "ss";
  if (t.includes("s賞")) return "s";
  if (t.includes("a賞")) return "a";
  if (t.includes("b賞")) return "b";

  // 2) code 先頭で判定（保険）
  const codeCore = raw.match(/([A-Z0-9]{3,10})$/)?.[1] ?? raw.split("-").pop() ?? raw;
  const c = (codeCore ?? "").toUpperCase();

  if (c.startsWith("SS")) return "ss";
  if (c.startsWith("S") && !c.startsWith("SS")) return "s";
  if (c.startsWith("A")) return "a";
  if (c.startsWith("B")) return "b";

  return "b";
}

function fxLabel(fx: FxKind) {
  if (fx === "ss") return "RANK SS";
  if (fx === "s") return "RANK S";
  if (fx === "a") return "RANK A";
  return "RANK B";
}

export default function Home() {
  const [phone, setPhone] = useState("");
  const [tickets, setTickets] = useState<number | null>(null);
  const [codes, setCodes] = useState<CodeRow[]>([]);
  const [msg, setMsg] = useState("");

  const [result, setResult] = useState<DrawResult | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinValue, setSpinValue] = useState("----");
  const [showReveal, setShowReveal] = useState(false);

  // 演出
  const [fx, setFx] = useState<FxKind>(null);
  const [fxKey, setFxKey] = useState(0);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const fxTimerRef = useRef<number | null>(null);

  // 画面全体演出（SS/S）
  const [screenFx, setScreenFx] = useState<null | "ss" | "s">(null);
  const screenFxTimerRef = useRef<number | null>(null);

  const rank = useMemo(() => (result ? detectRank(result.benefit_text, result.code) : null), [result]);

  useEffect(() => {
    if (!isSpinning) return;
    const id = setInterval(() => setSpinValue(spinText()), 60);
    return () => clearInterval(id);
  }, [isSpinning]);

  function startScreenFx(kind: FxKind) {
    if (kind !== "ss" && kind !== "s") return;

    setScreenFx(kind);
    if (screenFxTimerRef.current) window.clearTimeout(screenFxTimerRef.current);

    const ms = kind === "ss" ? 2600 : 2000;
    screenFxTimerRef.current = window.setTimeout(() => {
      setScreenFx(null);
    }, ms);
  }

  function startFx(kind: FxKind) {
    if (!kind) return;

    // SSをもっと豪華に
    const count = kind === "ss" ? 70 : kind === "s" ? 44 : kind === "a" ? 20 : 14;
    const now = Date.now();

    const next: Spark[] = Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const top = Math.random() * 100;

      const delay = Math.random() * (kind === "ss" ? 260 : kind === "s" ? 320 : 380);
      const dur = 900 + Math.random() * (kind === "ss" ? 2200 : kind === "s" ? 1700 : kind === "a" ? 1200 : 1000);

      const scale = 0.55 + Math.random() * (kind === "ss" ? 2.15 : kind === "s" ? 1.55 : kind === "a" ? 1.05 : 0.9);
      const rot = Math.random() * 360;
      const opacity = 0.18 + Math.random() * (kind === "ss" ? 0.55 : kind === "s" ? 0.40 : 0.26);

      return { id: `${now}-${i}`, left, top, delay, dur, scale, rot, opacity };
    });

    setFx(kind);
    setFxKey((k) => k + 1);
    setSparks(next);

    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current);
    fxTimerRef.current = window.setTimeout(() => {
      setFx(null);
      setSparks([]);
    }, kind === "ss" ? 5200 : kind === "s" ? 4200 : 3000);
  }

  // 結果を消さずに残数だけ更新
  async function checkTickets(opts?: { keepResult?: boolean }) {
    const keepResult = opts?.keepResult ?? false;

    setMsg("");
    if (!keepResult) {
      setResult(null);
      setShowReveal(false);
      setFx(null);
      setScreenFx(null);
      setSparks([]);
    }

    const p = normalizePhone(phone);
    if (!p) return setMsg("電話番号を入力してください");

    const nowIso = new Date().toISOString();

    const { data: tData, error: tErr } = await supabase
      .from("draw_tickets")
      .select("id")
      .eq("phone", p)
      .eq("status", "unused")
      .gte("expires_at", nowIso);

    if (tErr) return setMsg(`抽選権の取得に失敗しました: ${tErr.message}`);

    const { data: cData, error: cErr } = await supabase
      .from("prize_codes")
      .select("code, benefit_text")
      .eq("assigned_phone", p)
      .eq("status", "assigned");

    if (cErr) return setMsg(`コードの取得に失敗しました: ${cErr.message}`);

    setTickets(tData?.length ?? 0);
    setCodes((cData ?? []) as CodeRow[]);
  }

  async function drawKuji() {
    setMsg("");

    const p = normalizePhone(phone);
    if (!p) return setMsg("電話番号を入力してください");

    setIsSpinning(true);
    setResult(null);
    setShowReveal(false);
    setFx(null);
    setScreenFx(null);
    setSparks([]);

    try {
      const res = await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: p }),
      });

      const json = await res.json();

      if (!res.ok) {
        setIsSpinning(false);
        return setMsg(json?.error ?? "抽選に失敗しました");
      }

      const kind = detectRank(json?.benefit_text ?? "", json?.code ?? "");

      // ✅ SS/Sは少し溜める（激アツ）
      const suspense = kind === "ss" ? 1900 : kind === "s" ? 1350 : kind === "a" ? 900 : 720;

      setTimeout(() => {
        setIsSpinning(false);
        setResult(json);
        setShowReveal(true);

        startScreenFx(kind);
        startFx(kind);
      }, suspense);

      // 抽選権残数だけ更新（結果は保持）
      setTimeout(() => {
        checkTickets({ keepResult: true });
      }, suspense + 420);
    } catch (e: any) {
      setIsSpinning(false);
      setMsg(`通信エラー: ${e?.message ?? "Failed to fetch"}`);
    }
  }

  const screenFxClass =
    screenFx === "ss" ? "screenFx screenFxSS" : screenFx === "s" ? "screenFx screenFxS" : "";

  return (
    <main className={`wrap ${screenFxClass}`}>
      <div className="bgOrnament" aria-hidden="true" />
      <div className="container">
        <header className="hero">
          <div className="brandRow">
            <div className="mark" aria-hidden="true" />
            <div>
              <div className="brand">Richard 上越</div>
              <div className="sub">ANNIVERSARY EVENT</div>
            </div>
            <div className="chip">3月限定</div>
          </div>

          <h1 className="title">周年イベントくじ</h1>
          <div className="annivCatch">いつもより、ちょっと豪華に。周年イベント開催中。</div>

          <section className="greeting" aria-label="挨拶文">
            <p>いつも Richard 上越 をご利用いただき、誠にありがとうございます。</p>
            <p>
              日頃よりご来店くださるお客様、そして支えてくださる皆様のおかげで、
              当店は今年も周年の節目を迎えることができました。心より感謝申し上げます。
            </p>
            <p>
              ささやかではございますが、感謝の気持ちを込めて「周年イベントくじ」をご用意しました。
              ぜひこの機会に、いつもより少し特別な時間をお楽しみください。
            </p>
            <p>
              これからも「また来たい」と思っていただけるお店であり続けられるよう、
              キャスト・スタッフ一同、より一層サービス向上に努めてまいります。
            </p>
            <p>皆様のご来店を心よりお待ちしております。</p>
          </section>

          <section className="ruleCard" aria-label="くじを引く手順">
            <div className="ruleTitle">くじを引く手順</div>
            <ol className="ruleList">
              <li>電話番号を入力</li>
              <li>「抽選権を確認」を押す</li>
              <li>抽選権が1回以上なら「くじを引く」</li>
              <li>表示された4文字コードを控える</li>
              <li>次回予約時に「周年コード：XXXX」と伝える</li>
            </ol>
          </section>
        </header>

        <section className="card glass">
          <div className="row">
            <div className="field">
              <div className="label">電話番号</div>
              <input className="input" placeholder="090xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <button className="btn" onClick={() => checkTickets()} disabled={isSpinning}>
              抽選権を確認
            </button>

            <button className="btn primary" onClick={drawKuji} disabled={isSpinning || (tickets !== null && tickets <= 0)}>
              {isSpinning ? "抽選中..." : "くじを引く"}
            </button>
          </div>

          {msg && <p className="msg">{msg}</p>}

          <div className="metaBar">
            <div className="metaItem">
              <div className="metaKey">抽選権</div>
              <div className="metaVal">{tickets === null ? "—" : `${tickets}回`}</div>
            </div>
          </div>

          <div className="gacha">
            <div className="gachaHead">RICHARD GACHA</div>

            <div className={`metalFrame ${rank ? `metal-${rank}` : ""}`}>
              <div className="metalInner">
                {showReveal && result && fx && (
                  <div key={fxKey} className={`fx fx-${fx}`} aria-hidden="true">
                    <div className="fxFlash" />
                    <div className="fxSweep" />
                    <div className="fxBadge">{fxLabel(fx)}</div>

                    {(fx === "s" || fx === "ss") && <div className={`starburst ${fx === "ss" ? "starburstSS" : ""}`} />}

                    <div className="fxSparks">
                      {sparks.map((s) => (
                        <span
                          key={s.id}
                          className={`spark spark-${fx}`}
                          style={{
                            left: `${s.left}%`,
                            top: `${s.top}%`,
                            animationDelay: `${s.delay}ms`,
                            animationDuration: `${s.dur}ms`,
                            opacity: s.opacity,
                            transform: `translate(-50%, -50%) rotate(${s.rot}deg) scale(${s.scale})`,
                          }}
                        />
                      ))}
                    </div>

                    {fx === "ss" && (
                      <div className="confetti">
                        {Array.from({ length: 44 }).map((_, i) => (
                          <span
                            key={`${fxKey}-c-${i}`}
                            className="conf"
                            style={{
                              left: `${2 + (i * 96) / 43}%`,
                              animationDelay: `${(i % 11) * 55}ms`,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {fx === "ss" && <div className="crown" aria-hidden="true">★</div>}
                  </div>
                )}

                <div
                  className={`slot ${isSpinning ? "slotSpin" : ""} ${showReveal && fx === "ss" ? "slotSS" : ""} ${
                    showReveal && fx === "s" ? "slotS" : ""
                  }`}
                >
                  {isSpinning ? spinValue : result ? short(result.code) : "----"}
                </div>
              </div>
            </div>

            {showReveal && result && (
              <div className={`result ${rank === "ss" ? "resultSS" : rank === "s" ? "resultS" : rank === "a" ? "resultA" : "resultB"}`}>
                <div className="resultLabel">今回の結果</div>
                <div className="benefit">{result.benefit_text}</div>

                <div className="rankRow">
                  <div className={`rankBadge rank-${rank ?? "b"}`}>{fxLabel(rank ?? "b")}</div>
                </div>

                <div className="noteBox">
                  <div className="noteTitle">次回予約で伝える内容</div>
                  <div className="noteText">
                    周年コード：<b>{short(result.code)}</b>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="sectionHead">
            <h2 className="h2">未使用コード（次回予約で伝えてください）</h2>
            <div className="sectionHint">4文字だけでOK</div>
          </div>

          <div className="codeNotice">
            ※コードは当日予約でも利用可能です。<br />
            ※有効期限は4月末までです。
          </div>

          {tickets === null ? (
            <p className="muted">「抽選権を確認」を押すと表示されます。</p>
          ) : codes.length === 0 ? (
            <p className="muted">未使用コードはありません。</p>
          ) : (
            <ul className="list">
              {codes.map((c) => (
                <li key={c.code} className="item">
                  <div className="itemLeft">
                    <div className="itemText">{c.benefit_text}</div>
                  </div>

                  <div className="itemRight">
                    <div className="itemCode">{short(c.code)}</div>
                    <button
                      className="btn mini copyBtn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(short(c.code));
                          setMsg(`✅ コピーしました（${short(c.code)}）`);
                          setTimeout(() => setMsg(""), 1200);
                        } catch {
                          setMsg("❌ コピーに失敗しました（ブラウザ権限を確認してください）");
                        }
                      }}
                    >
                      コピー
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <style>{`
        :root{
          --ink:#111827;
          --muted:#6b7280;

          --bg1:#fff8ee;
          --bg2:#f4efe3;
          --bg3:#f5f7fb;

          --line:rgba(17,24,39,0.12);
          --paper:rgba(255,255,255,0.92);
          --glass:rgba(255,255,255,0.72);
          --shadow:rgba(17,24,39,0.10);

          --ss:#c8a84b;
          --s:#9aa6b2;
          --a:#d7c48b;
          --b:#cbd5e1;
        }

        .wrap{
          min-height:100vh;
          color:var(--ink);
          background:
            radial-gradient(1100px 720px at 10% -10%, rgba(200,168,75,0.20), transparent 62%),
            radial-gradient(1000px 700px at 92% 6%, rgba(200,168,75,0.12), transparent 62%),
            radial-gradient(1000px 720px at 50% 100%, rgba(255,255,255,0.95), transparent 60%),
            linear-gradient(180deg, var(--bg1) 0%, var(--bg2) 45%, var(--bg3) 100%);
          position:relative;
          overflow-x:hidden;
        }
        .bgOrnament{
          position:absolute;
          inset:-20%;
          background:
            radial-gradient(circle at 30% 30%, rgba(255,255,255,0.65), transparent 55%),
            radial-gradient(circle at 70% 55%, rgba(200,168,75,0.12), transparent 60%);
          filter: blur(2px);
          pointer-events:none;
        }
        .container{
          max-width: 980px;
          margin: 0 auto;
          padding: 44px 18px 76px;
          position:relative;
          z-index:2;
        }

        /* 画面全体演出（SS/S） */
        .screenFx{
          animation: screenPulse 700ms ease-out 1;
        }
        .screenFxSS::before,
        .screenFxS::before{
          content:"";
          position:fixed;
          inset:0;
          pointer-events:none;
          z-index:1;
          opacity:0;
          animation: screenFlash 900ms ease-out forwards;
        }
        .screenFxSS::before{
          background:
            radial-gradient(800px 500px at 50% 35%, rgba(200,168,75,0.38), transparent 65%),
            radial-gradient(900px 650px at 30% 70%, rgba(255,255,255,0.18), transparent 60%),
            radial-gradient(900px 650px at 70% 70%, rgba(255,255,255,0.18), transparent 60%);
        }
        .screenFxS::before{
          background:
            radial-gradient(800px 500px at 50% 35%, rgba(154,166,178,0.28), transparent 65%),
            radial-gradient(900px 650px at 50% 75%, rgba(255,255,255,0.14), transparent 60%);
        }
        @keyframes screenFlash{
          0%{ opacity:0; }
          18%{ opacity:1; }
          55%{ opacity:0.45; }
          100%{ opacity:0; }
        }
        @keyframes screenPulse{
          0%{ filter: saturate(1); }
          35%{ filter: saturate(1.25) contrast(1.04); }
          100%{ filter: saturate(1) contrast(1); }
        }

        .hero{ padding: 14px 6px 6px; }
        .brandRow{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .mark{
          width:46px; height:46px; border-radius:16px;
          background:
            radial-gradient(circle at 30% 25%, rgba(255,255,255,0.96), rgba(255,255,255,0) 55%),
            linear-gradient(135deg, rgba(247,231,191,0.95), rgba(200,168,75,0.95));
          box-shadow: 0 16px 34px rgba(17,24,39,0.12);
        }
        .brand{ font-weight: 900; letter-spacing:0.02em; font-size:18px; }
        .sub{ font-size:12px; color:var(--muted); letter-spacing:0.16em; text-transform:uppercase; }
        .chip{
          margin-left:auto;
          padding:8px 12px;
          border-radius:999px;
          background: rgba(255,255,255,0.82);
          border:1px solid var(--line);
          box-shadow: 0 14px 30px rgba(17,24,39,0.06);
          font-size:12px;
          color:#374151;
        }
        .title{ margin: 16px 0 10px; font-size: 36px; letter-spacing: -0.03em; line-height:1.1; }

        /* ✅ 追加：周年イベント用サブキャッチ */
        .annivCatch{
          margin-top: 2px;
          font-size:13px;
          letter-spacing:0.10em;
          color: var(--muted);
        }

        .greeting{ margin-top: 8px; max-width: 860px; }
        .greeting p{ margin: 0 0 10px; color:#374151; line-height: 2.05; font-size: 14px; }
        .greeting p:last-child{ margin-bottom:0; }

        .ruleCard{
          margin-top: 14px;
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255,255,255,0.90);
          box-shadow: 0 18px 42px rgba(17,24,39,0.06);
          max-width: 780px;
        }
        .ruleTitle{ font-weight:900; letter-spacing:0.02em; margin-bottom: 8px; }
        .ruleList{
          margin: 0; padding-left: 0; list-style: none; counter-reset: step;
          color:#374151; line-height: 1.95; font-size: 14px;
        }
        .ruleList li{ counter-increment: step; display:flex; gap:10px; align-items:flex-start; padding: 6px 0; }
        .ruleList li::before{
          content: counter(step) ".";
          min-width: 22px;
          font-weight:900;
          color: rgba(200,168,75,0.95);
        }

        .card{
          background: var(--paper);
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 18px 44px var(--shadow);
          margin-top: 14px;
        }
        .glass{ background: var(--glass); backdrop-filter: blur(10px); }

        .row{ display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
        .field{ min-width: 260px; }
        .label{ font-size:12px; color:var(--muted); margin-bottom:6px; letter-spacing:0.06em; }

        .input{
          padding:12px 12px;
          border:1px solid rgba(17,24,39,0.16);
          border-radius:14px;
          width: 260px;
          outline:none;
          background: rgba(255,255,255,0.94);
          color: var(--ink);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.55) inset;
        }
        .input::placeholder{ color:#9ca3af; }
        .input:focus{
          border-color: rgba(200,168,75,0.70);
          box-shadow: 0 0 0 4px rgba(200,168,75,0.14);
        }

        .btn{
          padding:10px 14px;
          border-radius:14px;
          border:1px solid rgba(17,24,39,0.14);
          background: rgba(255,255,255,0.94);
          cursor:pointer;
          transition: transform .12s ease, box-shadow .12s ease;
          box-shadow: 0 12px 26px rgba(17,24,39,0.06);
          white-space: nowrap;
          color: var(--ink);
        }
        .btn:hover{ transform: translateY(-1px); }
        .btn:disabled{ opacity:0.6; cursor:not-allowed; transform:none; }
        .btn.primary{
          border-color: rgba(200,168,75,0.72);
          background:
            radial-gradient(circle at 25% 25%, rgba(255,255,255,0.96), rgba(255,255,255,0) 60%),
            linear-gradient(135deg, rgba(247,231,191,0.95), rgba(200,168,75,0.95));
          color:#1f2937;
          font-weight: 900;
        }
        .btn.mini{ padding:10px 12px; border-radius:12px; }
        .msg{ margin: 10px 0 0; color:#b91c1c; }

        .metaBar{ margin-top: 12px; display:flex; gap:10px; flex-wrap:wrap; }
        .metaItem{
          flex: 1 1 220px;
          background: rgba(255,255,255,0.82);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          max-width: 320px;
        }
        .metaKey{ font-size:12px; color:var(--muted); }
        .metaVal{ margin-top:4px; font-weight:900; letter-spacing:0.02em; }

        .gacha{ margin-top: 14px; position:relative; }
        .gachaHead{ font-size:12px; color:var(--muted); letter-spacing:0.18em; margin-bottom:8px; }

        .metalFrame{
          border-radius: 22px;
          padding: 3px;
          background:
            linear-gradient(135deg, rgba(0,0,0,0.92), rgba(20,20,22,0.88)),
            radial-gradient(circle at 30% 20%, rgba(200,168,75,0.35), transparent 55%);
          box-shadow: 0 26px 70px rgba(17,24,39,0.20);
          position: relative;
          overflow: hidden;
        }
        .metalFrame::before{
          content:"";
          position:absolute;
          inset:-60%;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.22) 45%, transparent 85%);
          transform: translateX(-120%);
          animation: shimmer 3.6s ease-in-out infinite;
          pointer-events:none;
        }
        @keyframes shimmer{
          0%{ transform: translateX(-120%) rotate(8deg); opacity:0; }
          20%{ opacity:0.55; }
          50%{ opacity:0.20; }
          100%{ transform: translateX(120%) rotate(8deg); opacity:0; }
        }

        .metalInner{
          background:
            radial-gradient(900px 380px at 50% 0%, rgba(200,168,75,0.18), transparent 60%),
            linear-gradient(180deg, rgba(12,12,14,0.92), rgba(0,0,0,0.86));
          border-radius: 20px;
          padding: 14px;
          position: relative;
        }

        .slot{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace;
          font-size: 54px;
          letter-spacing: 12px;
          text-align:center;
          padding: 22px 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background:
            radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), rgba(255,255,255,0) 55%),
            linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.00));
          color: rgba(255,255,255,0.92);
          user-select:none;
          position:relative;
          z-index:1;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.06) inset,
            0 18px 44px rgba(0,0,0,0.50);
        }
        .slotSpin{ animation: wobble 120ms ease-in-out infinite; }
        @keyframes wobble{
          0%{ transform: rotate(-0.4deg); }
          50%{ transform: rotate(0.4deg); }
          100%{ transform: rotate(-0.4deg); }
        }
        .slotSS{ animation: slotHitSS 760ms ease-out 1; }
        .slotS{ animation: slotHitS 620ms ease-out 1; }
        @keyframes slotHitSS{
          0%{ transform: scale(1.00); }
          18%{ transform: scale(1.03) rotate(-0.35deg); }
          36%{ transform: scale(1.02) rotate(0.35deg); }
          55%{ transform: scale(1.025) rotate(-0.22deg); }
          100%{ transform: scale(1.00) rotate(0deg); }
        }
        @keyframes slotHitS{
          0%{ transform: scale(1.00); }
          25%{ transform: scale(1.02) rotate(-0.28deg); }
          55%{ transform: scale(1.015) rotate(0.28deg); }
          100%{ transform: scale(1.00) rotate(0deg); }
        }

        .fx{ position:absolute; inset: 12px; pointer-events:none; z-index: 3; border-radius: 18px; overflow:hidden; }
        .fxFlash{ position:absolute; inset: 0; opacity: 0; animation: fxFlash 900ms ease-out forwards; }
        @keyframes fxFlash{
          0%{ opacity:0; }
          16%{ opacity:0.90; }
          45%{ opacity:0.22; }
          100%{ opacity:0; }
        }
        .fxSweep{
          position:absolute; inset: 0; opacity: 0;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.82) 45%, transparent 85%);
          transform: translateX(-120%);
          animation: sweep 1200ms ease-out forwards;
        }
        @keyframes sweep{
          0%{ opacity:0; transform: translateX(-120%); }
          10%{ opacity:0.95; }
          100%{ opacity:0; transform: translateX(120%); }
        }
        .fxBadge{
          position:absolute; top: 10px; right: 10px;
          padding: 7px 10px; border-radius: 999px;
          font-weight: 900; letter-spacing: 0.14em; font-size: 11px;
          background: rgba(255,255,255,0.90);
          border: 1px solid rgba(17,24,39,0.12);
          box-shadow: 0 12px 28px rgba(0,0,0,0.20);
        }
        .fx-ss .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.62), rgba(200,168,75,0.56)); }
        .fx-s  .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.55), rgba(154,166,178,0.44)); }
        .fx-a  .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.46), rgba(215,196,139,0.34)); }
        .fx-b  .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.36), rgba(203,213,225,0.28)); }

        .fxSparks{ position:absolute; inset:0; }
        .spark{ position:absolute; animation-timing-function: ease-out; animation-fill-mode: forwards; filter: blur(0.2px); }

        .spark-ss{
          width: 18px; height: 18px; border-radius: 999px;
          background:
            radial-gradient(circle at 35% 35%, rgba(255,255,255,0.98), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(200,168,75,0.98), rgba(200,168,75,0) 65%);
          animation-name: sparkPop;
        }
        .spark-s{
          width: 15px; height: 15px;
          background:
            radial-gradient(circle at 40% 35%, rgba(255,255,255,0.96), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(154,166,178,0.86), rgba(154,166,178,0) 70%);
          clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 92%, 50% 72%, 21% 92%, 32% 57%, 2% 35%, 39% 35%);
          animation-name: starPop;
        }
        .spark-a{
          width: 13px; height: 13px; border-radius: 999px;
          background:
            radial-gradient(circle at 35% 35%, rgba(255,255,255,0.92), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(215,196,139,0.82), rgba(215,196,139,0) 70%);
          animation-name: sparkPop;
        }
        .spark-b{
          width: 11px; height: 11px; border-radius: 999px;
          background:
            radial-gradient(circle at 35% 35%, rgba(255,255,255,0.85), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(203,213,225,0.78), rgba(203,213,225,0) 70%);
          animation-name: softPop;
        }
        @keyframes sparkPop{
          0%{ transform: translate(-50%, -50%) scale(0.15); opacity:0; }
          18%{ opacity:1; }
          100%{ transform: translate(-50%, -50%) scale(2.05); opacity:0; }
        }
        @keyframes starPop{
          0%{ transform: translate(-50%, -50%) scale(0.15) rotate(0deg); opacity:0; }
          22%{ opacity:1; }
          100%{ transform: translate(-50%, -50%) scale(1.85) rotate(240deg); opacity:0; }
        }
        @keyframes softPop{
          0%{ transform: translate(-50%, -50%) scale(0.2); opacity:0; }
          25%{ opacity:0.85; }
          100%{ transform: translate(-50%, -50%) scale(1.35); opacity:0; }
        }

        .starburst{
          position:absolute; left: 50%; top: 50%;
          width: 420px; height: 420px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          opacity: 0;
          background:
            conic-gradient(
              from 0deg,
              rgba(255,255,255,0) 0deg,
              rgba(255,255,255,0.30) 18deg,
              rgba(255,255,255,0) 36deg,
              rgba(255,255,255,0.18) 54deg,
              rgba(255,255,255,0) 72deg
            );
          filter: blur(0.9px);
          animation: burst 1150ms ease-out forwards;
        }
        .starburstSS{
          background:
            conic-gradient(
              from 0deg,
              rgba(255,255,255,0) 0deg,
              rgba(200,168,75,0.42) 16deg,
              rgba(255,255,255,0) 32deg,
              rgba(255,255,255,0.38) 52deg,
              rgba(255,255,255,0) 72deg
            );
        }
        @keyframes burst{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.65) rotate(0deg); }
          20%{ opacity:0.62; }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(1.25) rotate(130deg); }
        }

        .confetti{ position:absolute; inset:0; overflow:hidden; }
        .conf{
          position:absolute; top: -12px;
          width: 6px; height: 14px; border-radius: 2px;
          background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(200,168,75,0.82));
          opacity: 0.0;
          animation: fall 1600ms ease-in forwards;
        }
        @keyframes fall{
          0%{ transform: translateY(0) rotate(0deg); opacity: 0; }
          15%{ opacity: 0.98; }
          100%{ transform: translateY(300px) rotate(320deg); opacity: 0; }
        }

        .crown{
          position:absolute;
          left: 16px;
          top: 12px;
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display:flex;
          align-items:center;
          justify-content:center;
          background: rgba(255,255,255,0.88);
          border:1px solid rgba(255,255,255,0.20);
          box-shadow: 0 10px 24px rgba(0,0,0,0.20);
          font-weight: 900;
        }

        .result{
          margin-top: 14px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: rgba(255,255,255,0.92);
        }
        .resultSS{ border-color: rgba(200,168,75,0.60); box-shadow: 0 0 0 4px rgba(200,168,75,0.16); }
        .resultS { border-color: rgba(154,166,178,0.55); box-shadow: 0 0 0 4px rgba(154,166,178,0.12); }
        .resultA { border-color: rgba(215,196,139,0.55); box-shadow: 0 0 0 4px rgba(215,196,139,0.12); }
        .resultB { border-color: rgba(203,213,225,0.70); }

        .resultLabel{ font-size:12px; color:var(--muted); }
        .benefit{ margin-top: 6px; font-size: 20px; font-weight: 900; letter-spacing: -0.01em; color: var(--ink); }

        .rankRow{ margin-top: 10px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .rankBadge{
          font-size:12px;
          font-weight:900;
          letter-spacing:0.12em;
          padding:7px 10px;
          border-radius:999px;
          border:1px solid rgba(17,24,39,0.12);
          background: rgba(255,255,255,0.92);
        }
        .rank-ss{ border-color: rgba(200,168,75,0.60); }
        .rank-s{ border-color: rgba(154,166,178,0.55); }
        .rank-a{ border-color: rgba(215,196,139,0.55); }
        .rank-b{ border-color: rgba(203,213,225,0.70); }

        .noteBox{
          margin-top: 12px;
          padding: 12px;
          border: 1px dashed rgba(17,24,39,0.18);
          border-radius: 16px;
          background: rgba(255,255,255,0.86);
        }
        .noteTitle{ font-size:12px; color:var(--muted); margin-bottom: 6px; }
        .noteText{ font-size:14px; color:var(--ink); }

        .sectionHead{
          display:flex;
          align-items:baseline;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          margin-bottom: 10px;
        }
        .h2{ margin:0; font-size:16px; letter-spacing:-0.01em; }
        .sectionHint{ font-size:12px; color:var(--muted); letter-spacing:0.10em; }
        .muted{ margin:0; color:var(--muted); font-size:14px; }

        .codeNotice{
          margin: 6px 0 12px;
          font-size:12px;
          color:var(--muted);
          line-height:1.6;
        }

        .list{ list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px; }
        .item{
          display:flex;
          justify-content:space-between;
          align-items:center;
          padding:12px 14px;
          border:1px solid var(--line);
          border-radius:16px;
          background: rgba(255,255,255,0.94);
          box-shadow: 0 14px 30px rgba(17,24,39,0.06);
        }
        .itemLeft{ display:flex; flex-direction:column; gap:2px; }
        .itemRight{ display:flex; align-items:center; gap:10px; }
        .itemText{ color: var(--ink); font-weight:700; }

        .itemCode{
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","CourierNew", monospace;
          font-size: 18px;
          letter-spacing: 2px;
          color: var(--ink);
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(17,24,39,0.10);
          padding: 6px 10px;
          border-radius: 12px;
        }
        .copyBtn{ white-space: nowrap; }
      `}</style>
    </main>
  );
}
