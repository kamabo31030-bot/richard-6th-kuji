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

type ScreenDot = {
  id: string;
  left: number;
  top: number;
  delay: number;
  dur: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
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

  if (t.startsWith("ss賞") || t.startsWith("ss:") || t.startsWith("ss：") || t.startsWith("ss-") || t.startsWith("ss_"))
    return "ss";
  if (t.startsWith("s賞") || t.startsWith("s:") || t.startsWith("s：") || t.startsWith("s-") || t.startsWith("s_"))
    return "s";
  if (t.startsWith("a賞") || t.startsWith("a:") || t.startsWith("a：") || t.startsWith("a-") || t.startsWith("a_"))
    return "a";
  if (t.startsWith("b賞") || t.startsWith("b:") || t.startsWith("b：") || t.startsWith("b-") || t.startsWith("b_"))
    return "b";

  if (t.includes("ss賞")) return "ss";
  if (t.includes("s賞")) return "s";
  if (t.includes("a賞")) return "a";
  if (t.includes("b賞")) return "b";

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

  // ===== 枠内演出 =====
  const [fx, setFx] = useState<FxKind>(null);
  const [fxKey, setFxKey] = useState(0);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const fxTimerRef = useRef<number | null>(null);

  // ===== 画面全体演出 =====
  const [screenFx, setScreenFx] = useState<FxKind>(null);
  const [screenKey, setScreenKey] = useState(0);
  const [screenDots, setScreenDots] = useState<ScreenDot[]>([]);
  const screenTimerRef = useRef<number | null>(null);

  const rank = useMemo(() => (result ? detectRank(result.benefit_text, result.code) : null), [result]);

  useEffect(() => {
    if (!isSpinning) return;
    const id = setInterval(() => setSpinValue(spinText()), 60);
    return () => clearInterval(id);
  }, [isSpinning]);

  function startScreenFx(kind: FxKind) {
    if (!kind) return;

    const count = kind === "ss" ? 90 : kind === "s" ? 60 : kind === "a" ? 36 : 26;
    const now = Date.now();

    const dots: ScreenDot[] = Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const top = Math.random() * 100;
      const dur = 900 + Math.random() * (kind === "ss" ? 2600 : kind === "s" ? 1900 : kind === "a" ? 1500 : 1200);
      const delay = Math.random() * (kind === "ss" ? 220 : kind === "s" ? 260 : 320);
      const size = (kind === "ss" ? 2.2 : kind === "s" ? 2.0 : kind === "a" ? 1.8 : 1.6) + Math.random() * 4.2;
      const opacity = 0.08 + Math.random() * (kind === "ss" ? 0.22 : kind === "s" ? 0.18 : 0.14);
      const driftX = (Math.random() - 0.5) * (kind === "ss" ? 90 : kind === "s" ? 70 : 55);
      const driftY = (Math.random() - 0.5) * (kind === "ss" ? 110 : kind === "s" ? 90 : 70);

      return { id: `${now}-sd-${i}`, left, top, delay, dur, size, opacity, driftX, driftY };
    });

    setScreenFx(kind);
    setScreenKey((k) => k + 1);
    setScreenDots(dots);

    if (screenTimerRef.current) window.clearTimeout(screenTimerRef.current);
    screenTimerRef.current = window.setTimeout(() => {
      setScreenFx(null);
      setScreenDots([]);
    }, kind === "ss" ? 5200 : kind === "s" ? 3800 : 2800);
  }

  // ✅ SS豪華版：粒数/長さ/スケールを大幅UP
  function startFx(kind: FxKind) {
    if (!kind) return;

    const count = kind === "ss" ? 88 : kind === "s" ? 38 : kind === "a" ? 18 : 12;
    const now = Date.now();

    const next: Spark[] = Array.from({ length: count }).map((_, i) => {
      const left = Math.random() * 100;
      const top = Math.random() * 100;

      const delay = Math.random() * (kind === "ss" ? 260 : kind === "s" ? 320 : 380);

      const dur =
        900 +
        Math.random() *
          (kind === "ss" ? 2400 : kind === "s" ? 1600 : kind === "a" ? 1100 : 900);

      const scale =
        0.55 +
        Math.random() *
          (kind === "ss" ? 2.15 : kind === "s" ? 1.35 : kind === "a" ? 0.95 : 0.8);

      const rot = Math.random() * 360;

      const opacity = 0.18 + Math.random() * (kind === "ss" ? 0.55 : kind === "s" ? 0.34 : 0.22);

      return { id: `${now}-${i}`, left, top, delay, dur, scale, rot, opacity };
    });

    setFx(kind);
    setFxKey((k) => k + 1);
    setSparks(next);

    if (fxTimerRef.current) window.clearTimeout(fxTimerRef.current);
    fxTimerRef.current = window.setTimeout(() => {
      setFx(null);
      setSparks([]);
    }, kind === "ss" ? 5200 : kind === "s" ? 3800 : 2800);
  }

  async function checkTickets(opts?: { keepResult?: boolean }) {
    const keepResult = opts?.keepResult ?? false;

    setMsg("");
    if (!keepResult) {
      setResult(null);
      setShowReveal(false);
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
      const suspense = kind === "ss" ? 1650 : kind === "s" ? 1200 : kind === "a" ? 850 : 720;

      // ✅ 画面全体：SS/Sは“溜め”の時点から始める（激アツ）
      if (kind === "ss" || kind === "s") {
        setScreenFx(kind);
      } else {
        setScreenFx(null);
      }

      setTimeout(() => {
        setIsSpinning(false);
        setResult(json);
        setShowReveal(true);

        // ✅ リザルト表示タイミングで、枠内＆画面全体を同時にド派手に
        startFx(kind);
        startScreenFx(kind);
      }, suspense);

      setTimeout(() => {
        checkTickets({ keepResult: true });
      }, suspense + 350);
    } catch (e: any) {
      setIsSpinning(false);
      setMsg(`通信エラー: ${e?.message ?? "Failed to fetch"}`);
    }
  }

  return (
    <main className={`wrap ${screenFx ? `wrapFx wrapFx-${screenFx}` : ""}`}>
      {/* ✅ 画面全体演出レイヤー（固定・クリック透過） */}
      {(isSpinning || screenFx) && (
        <div className={`screenFx ${screenFx ? `screenFx-${screenFx}` : ""}`} aria-hidden="true">
          <div className="screenVignette" />
          <div className="screenSweep" />
          <div className="screenFlash" />
          <div className="screenDust" key={screenKey}>
            {screenDots.map((d) => (
              <span
                key={d.id}
                className="sd"
                style={{
                  left: `${d.left}%`,
                  top: `${d.top}%`,
                  width: `${d.size}px`,
                  height: `${d.size}px`,
                  opacity: d.opacity,
                  animationDelay: `${d.delay}ms`,
                  animationDuration: `${d.dur}ms`,
                  transform: `translate(-50%, -50%)`,
                  // driftはCSS変数で持たせる
                  ["--dx" as any]: `${d.driftX}px`,
                  ["--dy" as any]: `${d.driftY}px`,
                }}
              />
            ))}
          </div>

          {/* SS専用：画面中央に“JACKPOT” & 大リング */}
          {screenFx === "ss" && (
            <>
              <div className="screenJackpot">JACKPOT</div>
              <div className="screenRing" />
            </>
          )}

          {/* S専用：画面中央に“BIG WIN” */}
          {screenFx === "s" && <div className="screenBigwin">BIG WIN</div>}
        </div>
      )}

      <div className="bgOrnament" aria-hidden="true" />

      <div className="container">
        <header className="hero">
          <div className="brandRow">
            <div className="mark" aria-hidden="true" />
            <div>
              <div className="brand">Richard 上越</div>
              <div className="sub">6th Anniversary Lucky Draw</div>
            </div>
            <div className="chip">3月限定</div>
          </div>

          <h1 className="title">6周年くじ</h1>

          <section className="greeting" aria-label="挨拶文">
            <p>いつも Richard 上越 をご利用いただき、誠にありがとうございます。</p>
            <p>
              おかげさまで当店は、このたび６周年を迎えることができました。これも日頃よりご来店くださるお客様、
              そして支えてくださる皆様のおかげと、心より感謝申し上げます。
            </p>
            <p>
              これからも「また来たい」と思っていただけるお店であり続けられるよう、キャスト・スタッフ一同、
              より一層サービス向上に努めてまいります。
            </p>
            <p>
              これからも皆様に楽しんでいただける時間と空間をお届けできるよう精進してまいりますので、
              今後とも当店をよろしくお願いいたします。
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
              <input
                className="input"
                placeholder="090xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <button className="btn" onClick={() => checkTickets()} disabled={isSpinning}>
              抽選権を確認
            </button>

            <button
              className="btn primary"
              onClick={drawKuji}
              disabled={isSpinning || (tickets !== null && tickets <= 0)}
            >
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

                    {fx === "ss" && (
                      <>
                        <div className="ssAura" />
                        <div className="ssJackpot">JACKPOT</div>

                        <div className="ssFireworks">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <span
                              key={`${fxKey}-fw-${i}`}
                              className="fw"
                              style={{
                                left: `${10 + i * 14}%`,
                                top: `${18 + (i % 2) * 14}%`,
                                animationDelay: `${i * 90}ms`,
                              }}
                            />
                          ))}
                        </div>
                      </>
                    )}

                    {(fx === "s" || fx === "ss") && (
                      <div className={`starburst ${fx === "ss" ? "starburstSS" : ""}`} />
                    )}

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
              <div
                className={`result ${
                  rank === "ss" ? "resultSS" : rank === "s" ? "resultS" : rank === "a" ? "resultA" : "resultB"
                }`}
              >
                <div className="resultLabel">今回の結果</div>
                <div className="benefit">{result.benefit_text}</div>

                <div className="rankRow">
                  <div className={`rankBadge rank-${rank ?? "b"}`}>{fxLabel(rank ?? "b")}</div>
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

        /* ==========================
           画面全体FX
        ========================== */
        .wrapFx{ animation: screenPulse 1200ms ease-in-out 1; }
        .wrapFx-ss{ animation: screenPulseSS 1600ms ease-in-out 1; }
        .wrapFx-s{ animation: screenPulseS 1400ms ease-in-out 1; }

        @keyframes screenPulse{
          0%{ filter: brightness(1) saturate(1); }
          35%{ filter: brightness(1.06) saturate(1.06); }
          100%{ filter: brightness(1) saturate(1); }
        }
        @keyframes screenPulseS{
          0%{ filter: brightness(1) saturate(1); transform: translateZ(0); }
          25%{ filter: brightness(1.09) saturate(1.10); transform: translateZ(0); }
          55%{ filter: brightness(1.03) saturate(1.04); }
          100%{ filter: brightness(1) saturate(1); }
        }
        @keyframes screenPulseSS{
          0%{ filter: brightness(1) saturate(1); transform: translateZ(0); }
          18%{ filter: brightness(1.16) saturate(1.22); }
          40%{ filter: brightness(1.06) saturate(1.10); }
          100%{ filter: brightness(1) saturate(1); }
        }

        .screenFx{
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 999;
          overflow: hidden;
        }

        /* 暗くならないように“薄い”ビネット */
        .screenVignette{
          position:absolute;
          inset:-30%;
          background:
            radial-gradient(circle at 50% 45%, rgba(255,255,255,0.00), rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.18) 80%);
          opacity: 0;
          animation: vignette 1400ms ease-out 1 forwards;
        }
        @keyframes vignette{
          0%{ opacity:0; transform: scale(0.98); }
          20%{ opacity:0.85; }
          100%{ opacity:0; transform: scale(1.06); }
        }

        /* 画面を横切るライトスイープ（高級感） */
        .screenSweep{
          position:absolute;
          inset:-60%;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.18) 45%, transparent 85%);
          transform: translateX(-120%);
          opacity: 0;
          animation: screenSweep 1400ms ease-out 1 forwards;
          filter: blur(0.2px);
        }
        @keyframes screenSweep{
          0%{ opacity:0; transform: translateX(-120%) rotate(8deg); }
          12%{ opacity:0.90; }
          100%{ opacity:0; transform: translateX(120%) rotate(8deg); }
        }

        /* フラッシュ（暗転防止：白寄り） */
        .screenFlash{
          position:absolute;
          inset:0;
          opacity:0;
          background: radial-gradient(circle at 50% 45%, rgba(255,255,255,0.40), rgba(255,255,255,0.0) 60%);
          animation: screenFlash 900ms ease-out 1 forwards;
        }
        @keyframes screenFlash{
          0%{ opacity:0; }
          16%{ opacity:0.95; }
          45%{ opacity:0.18; }
          100%{ opacity:0; }
        }

        /* 金粉/ダスト */
        .screenDust{ position:absolute; inset:0; }
        .sd{
          position:absolute;
          border-radius: 999px;
          background:
            radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(200,168,75,0.95), rgba(200,168,75,0) 65%);
          animation-name: sdMove;
          animation-timing-function: ease-out;
          animation-fill-mode: forwards;
          filter: blur(0.1px);
        }
        @keyframes sdMove{
          0%{ transform: translate(-50%, -50%) scale(0.4); opacity:0; }
          20%{ opacity:1; }
          100%{ transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1.7); opacity:0; }
        }

        /* SS：画面中央のJACKPOT */
        .screenJackpot{
          position:absolute;
          left: 50%;
          top: 46%;
          transform: translate(-50%, -50%);
          padding: 12px 18px;
          border-radius: 999px;
          font-weight: 1000;
          letter-spacing: 0.24em;
          font-size: 16px;
          color: rgba(17,24,39,0.92);
          background:
            radial-gradient(circle at 25% 25%, rgba(255,255,255,0.96), rgba(255,255,255,0) 60%),
            linear-gradient(135deg, rgba(255,247,214,0.98), rgba(200,168,75,0.98));
          box-shadow:
            0 22px 60px rgba(0,0,0,0.30),
            0 0 70px rgba(200,168,75,0.28);
          opacity:0;
          animation: screenJackpot 1600ms ease-out 1 forwards;
          text-transform: uppercase;
          filter: drop-shadow(0 0 18px rgba(255,255,255,0.20));
        }
        @keyframes screenJackpot{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.72); filter: blur(1px); }
          18%{ opacity:1; transform: translate(-50%, -50%) scale(1.06); filter: blur(0px); }
          62%{ opacity:1; transform: translate(-50%, -50%) scale(1.00); }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(0.98); }
        }

        .screenRing{
          position:absolute;
          left:50%;
          top:50%;
          width: 44px;
          height: 44px;
          border-radius: 999px;
          transform: translate(-50%, -50%);
          border: 2px solid rgba(200,168,75,0.35);
          box-shadow: 0 0 0 1px rgba(255,255,255,0.12) inset;
          opacity:0;
          animation: screenRing 1500ms ease-out 1 forwards;
        }
        @keyframes screenRing{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.4); }
          18%{ opacity:0.75; }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(16); }
        }

        /* S：BIG WIN */
        .screenBigwin{
          position:absolute;
          left: 50%;
          top: 48%;
          transform: translate(-50%, -50%);
          padding: 10px 16px;
          border-radius: 999px;
          font-weight: 1000;
          letter-spacing: 0.22em;
          font-size: 14px;
          color: rgba(17,24,39,0.92);
          background: rgba(255,255,255,0.88);
          border: 1px solid rgba(17,24,39,0.12);
          box-shadow: 0 18px 44px rgba(0,0,0,0.18);
          opacity:0;
          animation: screenBigwin 1200ms ease-out 1 forwards;
          text-transform: uppercase;
        }
        @keyframes screenBigwin{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.80); }
          18%{ opacity:1; transform: translate(-50%, -50%) scale(1.05); }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(1.00); }
        }

        /* ==========================
           既存の画面（明るめ高級）
        ========================== */
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

        .slotSS{
          animation: slotHitSS 680ms ease-out 1, ssPulse 1600ms ease-in-out 2;
          text-shadow: 0 0 18px rgba(255,255,255,0.35), 0 0 34px rgba(200,168,75,0.45);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.12) inset,
            0 18px 44px rgba(0,0,0,0.55),
            0 0 70px rgba(200,168,75,0.35);
        }
        .slotS{ animation: slotHitS 560ms ease-out 1; }

        @keyframes slotHitSS{
          0%{ transform: scale(1.00); }
          18%{ transform: scale(1.02) rotate(-0.3deg); }
          36%{ transform: scale(1.01) rotate(0.3deg); }
          55%{ transform: scale(1.015) rotate(-0.2deg); }
          100%{ transform: scale(1.00) rotate(0deg); }
        }
        @keyframes slotHitS{
          0%{ transform: scale(1.00); }
          25%{ transform: scale(1.015) rotate(-0.25deg); }
          55%{ transform: scale(1.01) rotate(0.25deg); }
          100%{ transform: scale(1.00) rotate(0deg); }
        }
        @keyframes ssPulse{
          0%{ filter: brightness(1); transform: scale(1.00); }
          40%{ filter: brightness(1.22); transform: scale(1.018); }
          100%{ filter: brightness(1); transform: scale(1.00); }
        }

        .fx{ position:absolute; inset: 12px; pointer-events:none; z-index: 3; border-radius: 18px; overflow:hidden; }
        .fxFlash{ position:absolute; inset: 0; opacity: 0; animation: fxFlash 900ms ease-out forwards; }
        @keyframes fxFlash{
          0%{ opacity:0; }
          16%{ opacity:0.85; }
          45%{ opacity:0.22; }
          100%{ opacity:0; }
        }
        .fxSweep{
          position:absolute; inset: 0; opacity: 0;
          background: linear-gradient(110deg, transparent 0%, rgba(255,255,255,0.78) 45%, transparent 85%);
          transform: translateX(-120%);
          animation: sweep 1200ms ease-out forwards;
        }
        @keyframes sweep{
          0%{ opacity:0; transform: translateX(-120%); }
          10%{ opacity:0.92; }
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
        .fx-ss .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.56), rgba(200,168,75,0.42)); }
        .fx-s  .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.50), rgba(154,166,178,0.36)); }
        .fx-a  .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.46), rgba(215,196,139,0.32)); }
        .fx-b  .fxFlash{ background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.36), rgba(203,213,225,0.28)); }

        .fxSparks{ position:absolute; inset:0; }
        .spark{ position:absolute; animation-timing-function: ease-out; animation-fill-mode: forwards; filter: blur(0.2px); }
        .spark-ss{
          width: 16px; height: 16px; border-radius: 999px;
          background:
            radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(200,168,75,0.95), rgba(200,168,75,0) 65%);
          animation-name: sparkPop;
        }
        .spark-s{
          width: 14px; height: 14px;
          background:
            radial-gradient(circle at 40% 35%, rgba(255,255,255,0.95), rgba(255,255,255,0) 60%),
            radial-gradient(circle at 60% 55%, rgba(154,166,178,0.80), rgba(154,166,178,0) 70%);
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
          0%{ transform: translate(-50%, -50%) scale(0.2); opacity:0; }
          20%{ opacity:1; }
          100%{ transform: translate(-50%, -50%) scale(1.7); opacity:0; }
        }
        @keyframes starPop{
          0%{ transform: translate(-50%, -50%) scale(0.2) rotate(0deg); opacity:0; }
          25%{ opacity:1; }
          100%{ transform: translate(-50%, -50%) scale(1.6) rotate(220deg); opacity:0; }
        }
        @keyframes softPop{
          0%{ transform: translate(-50%, -50%) scale(0.2); opacity:0; }
          25%{ opacity:0.85; }
          100%{ transform: translate(-50%, -50%) scale(1.35); opacity:0; }
        }

        .starburst{
          position:absolute; left: 50%; top: 50%;
          width: 380px; height: 380px;
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
          animation: burst 1100ms ease-out forwards;
        }
        .starburstSS{
          background:
            conic-gradient(
              from 0deg,
              rgba(255,255,255,0) 0deg,
              rgba(200,168,75,0.36) 16deg,
              rgba(255,255,255,0) 32deg,
              rgba(255,255,255,0.34) 52deg,
              rgba(255,255,255,0) 72deg
            );
        }
        @keyframes burst{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.7) rotate(0deg); }
          20%{ opacity:0.56; }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(1.22) rotate(120deg); }
        }

        .confetti{ position:absolute; inset:0; overflow:hidden; }
        .conf{
          position:absolute; top: -12px;
          width: 6px; height: 12px; border-radius: 2px;
          background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(200,168,75,0.75));
          opacity: 0.0;
          animation: fall 1750ms ease-in forwards;
        }
        @keyframes fall{
          0%{ transform: translateY(0) rotate(0deg); opacity: 0; }
          15%{ opacity: 0.95; }
          100%{ transform: translateY(340px) rotate(320deg); opacity: 0; }
        }

        .ssAura{
          position:absolute;
          inset:-20%;
          background:
            radial-gradient(circle at 50% 40%, rgba(200,168,75,0.30), transparent 55%),
            radial-gradient(circle at 30% 25%, rgba(255,255,255,0.22), transparent 50%),
            radial-gradient(circle at 70% 65%, rgba(255,255,255,0.18), transparent 55%);
          filter: blur(2px);
          animation: aura 1200ms ease-out 1 forwards;
        }
        @keyframes aura{
          0%{ opacity:0; transform: scale(0.92); }
          20%{ opacity:1; }
          100%{ opacity:0; transform: scale(1.06); }
        }

        .ssJackpot{
          position:absolute;
          left: 50%;
          top: 54%;
          transform: translate(-50%, -50%);
          padding: 10px 16px;
          border-radius: 999px;
          font-weight: 1000;
          letter-spacing: 0.22em;
          font-size: 14px;
          color: rgba(17,24,39,0.92);
          background:
            radial-gradient(circle at 25% 25%, rgba(255,255,255,0.96), rgba(255,255,255,0) 60%),
            linear-gradient(135deg, rgba(255,247,214,0.98), rgba(200,168,75,0.98));
          box-shadow:
            0 18px 44px rgba(0,0,0,0.35),
            0 0 40px rgba(200,168,75,0.28);
          opacity: 0;
          animation: jackpot 1200ms ease-out forwards;
          text-transform: uppercase;
        }
        @keyframes jackpot{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.75); filter: blur(1px); }
          18%{ opacity:1; transform: translate(-50%, -50%) scale(1.05); filter: blur(0px); }
          60%{ opacity:1; transform: translate(-50%, -50%) scale(1.00); }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(0.98); }
        }

        .ssFireworks{ position:absolute; inset:0; pointer-events:none; }
        .fw{
          position:absolute;
          width: 140px;
          height: 140px;
          border-radius: 999px;
          transform: translate(-50%, -50%) scale(0.6);
          opacity: 0;
          background:
            conic-gradient(
              from 0deg,
              rgba(255,255,255,0) 0deg,
              rgba(255,255,255,0.35) 12deg,
              rgba(255,255,255,0) 24deg,
              rgba(200,168,75,0.35) 36deg,
              rgba(255,255,255,0) 48deg
            );
          filter: blur(0.6px);
          animation: fw 1400ms ease-out forwards;
        }
        @keyframes fw{
          0%{ opacity:0; transform: translate(-50%, -50%) scale(0.35) rotate(0deg); }
          18%{ opacity:0.85; }
          100%{ opacity:0; transform: translate(-50%, -50%) scale(1.45) rotate(140deg); }
        }

        .result{
          margin-top: 14px;
          padding: 14px;
          border: 1px solid var(--line);
          border-radius: 18px;
          background: rgba(255,255,255,0.92);
        }
        .resultSS{ border-color: rgba(200,168,75,0.55); box-shadow: 0 0 0 4px rgba(200,168,75,0.14); }
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
