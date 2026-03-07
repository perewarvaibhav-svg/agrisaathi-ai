"use client";
import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ModulePanel from "@/components/ModulePanel";
import ProtectedRoute from "@/components/ProtectedRoute";
import ChatLog from "@/components/ChatLog";

const ML_BASE = "";

/* ─── Types ─── */
interface Message { id: number; role: "user" | "ai"; text: string; timestamp?: number; }

/* ─── Format backend module responses cleanly ─── */
const formatModuleResponse = (mod: string, d: Record<string, any>): string => {
  if (mod === "crop") {
    const warns = (d.warnings as string[]);
    return `🌾 CROP RECOMMENDATION\n\n${d.explanation}\n\nConfidence: ${d.confidence}%${warns?.length ? "\n\n⚠️ Warnings:\n" + warns.map(w => "• " + w).join("\n") : ""}`;
  }
  if (mod === "fertilizer") return `🧪 FERTILIZER PLAN\nCrop: ${d.crop} — Stage: ${d.stage}\n\n📦 Dosage:\n${(d.recommendations as string[]).map(r => "• " + r).join("\n")}\n\n🔬 Why:\n${(d.scientific_reasoning as string[]).map(r => "• " + r).join("\n")}`;

  if (mod === "weather") {
    const w = d.current_weather || {};
    return `🌤️ WEATHER & PREDICTIVE RISK [Score: ${d.risk?.score}/100]\nStatus: ${d.risk?.level} ${d.risk?.color}\n\n🌡️ Current: ${w.temp}°C | ${w.description}\n📅 Forecast: ${d.forecast_summary}\n\n🤖 AI Advice:\n${d.ai_advice}`;
  }

  if (mod === "soil") return `🌍 SOIL INTELLIGENCE [${d.status}]\nTexture: ${d.texture || 'N/A'}\n\n📝 Insights:\n${(d.insights as string[]).map(i => "• " + i).join("\n")}${(d.rejuvenation_steps as string[])?.length ? "\n\n🌱 Rejuvenation:\n" + (d.rejuvenation_steps as string[]).map(s => "• " + s).join("\n") : ""}`;

  if (mod === "pest") {
    let text = `🐛 PEST & DISEASE DIAGNOSIS [${d.risk_level}]\nScore: ${d.risk_score}/100\n\n`;
    if (d.ai_diagnosis) text += `🧪 AI Diagnosis:\n${d.ai_diagnosis}\n\n`;
    text += `🦠 Identified Threats:\n${(d.threats as string[]).map(t => "• " + t).join("\n")}\n\n`;
    text += `💊 Immediate Actions:\n${(d.actions as string[]).map(a => "• " + a).join("\n")}\n\n`;
    text += `📝 Summary: ${d.summary}`;
    return text;
  }

  if (mod === "yield") return `📊 YIELD PREDICTION\n\n${d.summary}\n\n💡 Tips:\n${(d.advice as string[]).map(a => "• " + a).join("\n")}`;

  if (mod === "rotation") {
    return `🔄 SMART ROTATION PLAN\n\n${(d.rotation_plan as string[]).join("\n")}\n\n🌱 Nitrogen Fixer: ${d.nitrogen_fixer}\n\n🔬 AI Reasoning:\n${d.ai_reasoning || (d.reasoning as string[])?.join("\n")}\n\n📝 Summary: ${d.summary}`;
  }
  return JSON.stringify(d, null, 2);
};

/* ─── Design tokens ─── */
const C = {
  bg: "#080C08",
  sidebar: "#0d120d",
  panel: "#111611",
  border: "rgba(173,255,47,0.1)",
  accent: "#ADFF2F",
  yellow: "#F5C518",
  dim: "rgba(173,255,47,0.5)",
  header: "linear-gradient(90deg,#106f8c,#083c50)",
};

export default function AdvisorDashboard() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [selectedLang, setSelectedLang] = useState("en");
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatSessions, setChatSessions] = useState<Array<{ id: string; title: string; date: string; messages: Message[] }>>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ── Load chat history from localStorage on mount ── */
  useEffect(() => {
    if (user) {
      const savedHistory = localStorage.getItem(`agrisaathi_chat_${user.id}`);
      if (savedHistory) {
        try {
          const parsed = JSON.parse(savedHistory);
          setMessages(parsed);
        } catch (e) {
          console.error("Failed to load chat history", e);
        }
      }

      // Load all chat sessions
      const savedSessions = localStorage.getItem(`agrisaathi_sessions_${user.id}`);
      if (savedSessions) {
        try {
          setChatSessions(JSON.parse(savedSessions));
        } catch (e) {
          console.error("Failed to load chat sessions", e);
        }
      }
    }
  }, [user]);

  /* ── Save chat history to localStorage whenever messages change ── */
  useEffect(() => {
    if (user && messages.length > 0) {
      localStorage.setItem(`agrisaathi_chat_${user.id}`, JSON.stringify(messages));
    }
  }, [messages, user]);

  /* ── Sync language from Navbar dropdown ── */
  useEffect(() => {
    const saved = localStorage.getItem("agrisaathi_lang");
    if (saved) setSelectedLang(saved);
    const handler = (e: Event) => setSelectedLang((e as CustomEvent<string>).detail);
    window.addEventListener("agrisaathi_lang_change", handler);
    return () => window.removeEventListener("agrisaathi_lang_change", handler);
  }, []);

  /* ── Scroll to bottom on new messages ── */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  /* ── Main submit handler (used by ModulePanel + chat input) ── */
  const handleSubmit = async (question: string, payload?: Record<string, unknown>) => {
    const userMsg: Message = { id: Date.now(), role: "user", text: question, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const mod = payload?.module as string | undefined;
      let body: Record<string, unknown> = { ...payload, lang: selectedLang };
      delete body.module;

      /* ── Module-specific calls ── */
      if (mod === "market") {
        try {
          const res = await fetch(`${ML_BASE}/api/market-prices?commodity=${body.commodity}&state=${encodeURIComponent(body.state as string)}&lang=${selectedLang}`);
          if (res.ok) {
            const d = await res.json();

            // Check if API returned an error
            if (d.error) {
              pushAI(`❌ ${d.error}`);
              setIsTyping(false);
              return;
            }

            let txt = `💰 MARKET PRICES — ${d.commodity} in ${d.state}\n`;
            txt += `📌 Current: ₹${d.current_price_inr}/${d.unit}${d.msp ? ` (MSP: ₹${d.msp})` : ""}\n`;
            txt += `\n📈 7-Day Trend: ${d["7_day_trend"].slice(-3).map((t: { date: string; price: number }) => `${t.date}: ₹${t.price}`).join(" → ")}\n`;
            txt += `\n🏪 Markets Today:\n` + d.market_centers.map((m: { market: string; price: number; change_pct: number }) => `• ${m.market}: ₹${m.price} (${m.change_pct > 0 ? "+" : ""}${m.change_pct}%)`).join("\n");
            txt += `\n\n💡 Insights:\n` + d.market_insights.map((i: string) => `• ${i}`).join("\n");
            pushAI(txt);
          } else {
            pushAI("❌ Could not fetch market prices. Server returned an error.");
          }
        } catch (err) {
          pushAI("❌ Network error fetching market prices. Please try again.");
        }
        setIsTyping(false);
        return;
      }

      if (mod === "notify") {
        pushAI(`🔔 ALERT PREFERENCES SAVED\n\nPhone: ${body.phone}\nTelegram ID: ${body.telegram_chat_id || "Not provided"}\nAlert Types: ${(body.alert_types as string[]).join(", ")}\nSeverity: ${body.severity}\n\n✅ You'll receive alerts via your configured channels once Telegram + Twilio keys are active.`);
        return;
      }

      /* ── 5 Core governance modules ── */
      const llmPost = async (endpoint: string, payload: unknown) => {
        const r = await fetch(`${ML_BASE}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        return r.ok ? r.json() : null;
      };

      if (mod === "subsidy") {
        const d = await llmPost("/api/subsidy-match", { ...body, land_area_acres: parseFloat(body.land_area_acres as string), annual_income_inr: parseInt(body.annual_income_inr as string) });
        if (d) { pushAI(`🧧 SUBSIDY MATCHES — ${d.state}\n\n${d.matches}`); return; }
      }
      if (mod === "scheme_draft") {
        const d = await llmPost("/api/scheme-draft", { ...body, land_area_acres: parseFloat(body.land_area_acres as string) });
        if (d) { pushAI(`📝 APPLICATION LETTER — ${d.scheme}\n\n${d.draft}`); return; }
      }
      if (mod === "contract") {
        const d = await llmPost("/api/contract-audit", body);
        if (d) { pushAI(`⚖️ CONTRACT AUDIT\n\n${d.audit}`); return; }
      }
      if (mod === "dispute") {
        const d = await llmPost("/api/dispute-advice", body);
        if (d) { pushAI(`🤝 LEGAL GUIDANCE — ${d.dispute_type}\n\n${d.advice}`); return; }
      }
      if (mod === "governance") {
        const d = await llmPost("/api/governance-feed", { state: body.state, category: body.category, lang: selectedLang });
        if (d) { pushAI(`🗞️ SCHEME FEED — ${d.state}\n\n${d.schemes}\n\n⚠️ ${d.disclaimer}\n📅 Generated: ${d.generated_on}`); return; }
      }

      if (mod === "satellite") {
        const d = await llmPost("/api/satellite-analysis", {
          lat: parseFloat(body.lat as string),
          lon: parseFloat(body.lon as string),
          crop: body.crop,
          area_acres: parseFloat(body.area_acres as string),
          lang: selectedLang
        });
        if (d) {
          const healthColor = d.health_label === "EXCELLENT" ? "🟢" : d.health_label === "GOOD" ? "🟡" : d.health_label === "MODERATE" ? "🟠" : "🔴";
          let txt = `🛰️ SATELLITE ANALYSIS — ${(d.crop as string).toUpperCase()}\n\n`;
          txt += `${healthColor} Crop Health: ${d.health_label} (Score: ${d.health_score}/100)\n`;
          txt += `📡 NDVI: ${d.indices.ndvi} | EVI: ${d.indices.evi} | SAVI: ${d.indices.savi}\n`;
          txt += `📅 Last Satellite Pass: ${d.last_overpass} | Next: ${d.next_overpass}\n`;
          if ((d.anomalies_detected as string[]).length > 0) {
            txt += `\n⚠️ Anomalies Detected:\n` + (d.anomalies_detected as string[]).map((a: string) => `  ${a}`).join("\n");
          } else {
            txt += `\n✅ No anomalies detected — field appears healthy.`;
          }
          txt += `\n\n🤖 AI Analysis:\n${d.ai_analysis}`;
          txt += `\n\n📡 Source: ${d.data_source}`;
          pushAI(txt); return;
        }
      }

      const ENDPOINTS: Record<string, string> = {
        crop: "/api/recommend",
        fertilizer: "/api/fertilizer-optimize",
        weather: "/api/weather-advice",
        soil: "/api/soil-health",
        pest: "/api/pest-disease",
        yield: "/api/yield-predict",
        rotation: "/api/crop-rotation",
      };

      if (mod && ENDPOINTS[mod]) {
        if (mod === "fertilizer") {
          body = { ...body, prev_fertilizers: "DAP", visual_indicators: "" };
        }
        const res = await fetch(`${ML_BASE}${ENDPOINTS[mod]}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const d = await res.json();
          pushAI(formatModuleResponse(mod, d));
          return;
        }
      }

      /* ── General chat fallback → LLM ── */
      const chatRes = await fetch(`${ML_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, lang: selectedLang }),
      });
      if (chatRes.ok) {
        const d = await chatRes.json();
        pushAI(d.message);
        return;
      }

      pushAI("⚠️ Could not connect to AI backend. Make sure the Python server is running on port 8000.");
    } catch {
      pushAI("⚠️ Network error — make sure the backend is running: `uvicorn main:app --port 8000`");
    } finally {
      setIsTyping(false);
    }
  };

  const pushAI = (text: string) =>
    setMessages(prev => [...prev, { id: Date.now() + 1, role: "ai", text, timestamp: Date.now() }]);

  const handleSend = () => {
    if (!input.trim() || isTyping) return;
    handleSubmit(input.trim());
    setInput("");
  };

  const clearHistory = () => {
    if (confirm("Clear all chat history? This cannot be undone.")) {
      setMessages([]);
      if (user) {
        localStorage.removeItem(`agrisaathi_chat_${user.id}`);
      }
    }
  };

  const saveCurrentSession = () => {
    if (user && messages.length > 0) {
      const sessionTitle = messages[0]?.text.slice(0, 50) || "New Chat";
      const newSession = {
        id: Date.now().toString(),
        title: sessionTitle,
        date: new Date().toLocaleDateString(),
        messages: [...messages]
      };
      const updatedSessions = [newSession, ...chatSessions].slice(0, 20); // Keep last 20 sessions
      setChatSessions(updatedSessions);
      localStorage.setItem(`agrisaathi_sessions_${user.id}`, JSON.stringify(updatedSessions));
    }
  };

  const loadSession = (session: { id: string; title: string; date: string; messages: Message[] }) => {
    setMessages(session.messages);
    setShowHistory(false);
  };

  const deleteSession = (sessionId: string) => {
    if (confirm("Delete this chat session?")) {
      const updatedSessions = chatSessions.filter(s => s.id !== sessionId);
      setChatSessions(updatedSessions);
      if (user) {
        localStorage.setItem(`agrisaathi_sessions_${user.id}`, JSON.stringify(updatedSessions));
      }
    }
  };

  const startNewChat = () => {
    if (messages.length > 0) {
      saveCurrentSession();
    }
    setMessages([]);
  };

  /* ── Render ── */
  return (
    <ProtectedRoute>
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "var(--font-body)", color: C.accent, display: "flex", flexDirection: "column" }}>
        <Navbar />

        {/* ── Main 2-column dashboard ── */}
        <div style={{
          display: "flex", flex: 1,
          paddingTop: "90px", /* accounts for fixed Navbar height */
          height: "calc(100vh - 90px)",
          overflow: "hidden",
        }}>

          {/* ══ LEFT SIDEBAR — Module Selector ══ */}
          <aside style={{
            width: "300px", flexShrink: 0,
            background: C.sidebar,
            borderRight: `1px solid ${C.border}`,
            overflowY: "auto",
            padding: "1.25rem 0.75rem",
            display: "flex", flexDirection: "column", gap: "0.75rem",
          }}>
            <div style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: C.dim, padding: "0 0.5rem", marginBottom: "0.25rem" }}>
              SELECT AI MODULE
            </div>
            <ModulePanel onSubmit={handleSubmit} />

            {/* Climate map link */}
            <Link href="/climate-map" style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              background: "rgba(173,255,47,0.04)", border: `1px solid ${C.border}`,
              color: C.accent, padding: "0.65rem 0.9rem", borderRadius: "10px",
              fontSize: "0.82rem", fontWeight: 600, textDecoration: "none",
              marginTop: "0.5rem",
            }}>
              🗺️ Open Climate Map
            </Link>
          </aside>

          {/* ══ RIGHT — Chat Panel ══ */}
          <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg }}>

            {/* Chat header */}
            <div style={{
              background: C.header, padding: "1rem 1.5rem",
              color: C.accent, fontWeight: 600, fontSize: "0.9rem",
              letterSpacing: "0.04em", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span>🌾 AgriSaathi AI Assistant</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.72rem", color: C.dim, fontWeight: 400 }}>
                  Lang: {selectedLang.toUpperCase()}
                </span>
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  style={{
                    background: "rgba(173,255,47,0.1)", border: `1px solid ${C.border}`,
                    color: C.accent, padding: "0.4rem 0.8rem", borderRadius: "6px",
                    fontSize: "0.75rem", cursor: "pointer", fontWeight: 600
                  }}
                  title="Chat History"
                >
                  📜 History
                </button>
                <button
                  onClick={startNewChat}
                  style={{
                    background: "rgba(173,255,47,0.1)", border: `1px solid ${C.border}`,
                    color: C.accent, padding: "0.4rem 0.8rem", borderRadius: "6px",
                    fontSize: "0.75rem", cursor: "pointer", fontWeight: 600
                  }}
                  title="New Chat"
                >
                  ➕ New
                </button>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  style={{
                    background: "rgba(173,255,47,0.1)", border: `1px solid ${C.border}`,
                    color: C.accent, padding: "0.4rem 0.8rem", borderRadius: "6px",
                    fontSize: "0.75rem", cursor: "pointer", fontWeight: 600
                  }}
                  title="Settings"
                >
                  ⚙️
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div style={{
              flex: 1, overflowY: "auto",
              padding: "1.5rem",
              display: "flex", flexDirection: "column", gap: "1.25rem",
            }}>
              {/* Welcome message */}
              {messages.length === 0 && (
                <div style={{
                  alignSelf: "flex-start", maxWidth: "75%",
                  background: "rgba(173,255,47,0.04)",
                  border: `1px solid ${C.border}`,
                  borderRadius: "0 12px 12px 12px",
                  padding: "0.9rem 1.2rem",
                  color: C.accent, fontSize: "0.92rem", lineHeight: 1.6,
                }}>
                  <strong>👋 Hi, I am AgriSaathi!</strong><br />
                  Select a module from the left panel to get AI advice, or just type your farming question below.
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} style={{
                  alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "78%",
                }}>
                  {msg.role === "user" ? (
                    <div style={{
                      background: "rgba(173,255,47,0.1)",
                      border: `1px solid rgba(173,255,47,0.2)`,
                      borderRadius: "12px 12px 0 12px",
                      padding: "0.75rem 1.1rem",
                      color: C.accent, fontSize: "0.9rem", lineHeight: 1.5,
                    }}>{msg.text}</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{
                        background: C.panel,
                        border: `1px solid ${C.border}`,
                        borderRadius: "0 12px 12px 12px",
                        padding: "0.9rem 1.2rem",
                        color: "rgba(173,255,47,0.9)", fontSize: "0.88rem", lineHeight: 1.7,
                        whiteSpace: "pre-wrap", wordBreak: "break-word",
                      }}>{msg.text}</div>

                      <button
                        onClick={async (e) => {
                          const btn = e.currentTarget;
                          const originalText = btn.innerHTML;
                          btn.innerHTML = "⏳ Generating Audio...";
                          try {
                            // Slice to 200 chars to prevent massive TTS payloads taking too long during demo
                            const audio = new Audio(`${ML_BASE}/api/tts?text=${encodeURIComponent(msg.text.slice(0, 250))}&lang=${selectedLang}`);
                            await audio.play();
                            btn.innerHTML = `🔊 Playing Audio...`;
                            audio.onended = () => btn.innerHTML = originalText;
                          } catch (err) {
                            btn.innerHTML = "⚠️ Audio Failed";
                            setTimeout(() => btn.innerHTML = originalText, 2000);
                          }
                        }}
                        style={{
                          alignSelf: "flex-start",
                          background: "rgba(173,255,47,0.06)",
                          border: `1px solid ${C.border}`,
                          color: C.accent,
                          padding: "0.4rem 0.8rem",
                          borderRadius: "6px",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(173,255,47,0.15)"}
                        onMouseLeave={e => e.currentTarget.style.background = "rgba(173,255,47,0.06)"}
                      >
                        ▶ Listen in {selectedLang.toUpperCase()}
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {isTyping && (
                <div style={{ alignSelf: "flex-start" }}>
                  <div style={{
                    background: C.panel, border: `1px solid ${C.border}`,
                    borderRadius: "0 12px 12px 12px", padding: "0.75rem 1.2rem",
                    color: C.dim, fontSize: "0.82rem",
                  }}>
                    <span style={{ animation: "pulse 1s infinite" }}>● ● ●</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Input bar */}
            <div style={{
              borderTop: `1px solid ${C.border}`,
              padding: "0.9rem 1.25rem",
              display: "flex", alignItems: "center", gap: "0.75rem",
              background: C.sidebar, flexShrink: 0,
            }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSend()}
                placeholder="Type a question about your farm…"
                style={{
                  flex: 1, background: "rgba(173,255,47,0.04)",
                  border: `1px solid ${C.border}`, color: C.accent,
                  borderRadius: "10px", padding: "0.65rem 1rem",
                  outline: "none", fontSize: "0.9rem", fontFamily: "inherit",
                }}
              />
              <button
                onClick={handleSend}
                disabled={isTyping || !input.trim()}
                style={{
                  background: input.trim() ? C.accent : "rgba(173,255,47,0.1)",
                  color: input.trim() ? "#000" : C.dim,
                  border: "none", borderRadius: "10px",
                  padding: "0.65rem 1.4rem", fontWeight: 700,
                  fontSize: "0.85rem", cursor: input.trim() ? "pointer" : "default",
                  transition: "all 0.2s", letterSpacing: "0.03em",
                }}
              >
                {isTyping ? "…" : "Send ▶"}
              </button>
            </div>
          </main>

          {/* ══ CHAT LOG PANEL ══ */}
          {showHistory && user && (
            <ChatLog
              userId={user.id}
              currentMessages={messages}
              onLoadSession={(msgs) => { setMessages(msgs); }}
              onNewChat={startNewChat}
              onClose={() => setShowHistory(false)}
            />
          )}

          {/* ══ SETTINGS PANEL ══ */}
          {showSettings && (
            <div style={{
              position: "fixed", top: "90px", right: "20px", width: "350px",
              background: C.sidebar, border: `1px solid ${C.border}`,
              borderRadius: "12px", padding: "1.5rem", zIndex: 1000,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem", color: C.accent }}>⚙️ Settings</h3>
                <button onClick={() => setShowSettings(false)} style={{
                  background: "transparent", border: "none", color: C.accent,
                  fontSize: "1.5rem", cursor: "pointer", padding: 0
                }}>×</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: C.dim, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    User Profile
                  </div>
                  <div style={{
                    background: "rgba(173,255,47,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: "8px", padding: "1rem"
                  }}>
                    <div style={{ fontSize: "0.9rem", color: C.accent, fontWeight: 600, marginBottom: "0.25rem" }}>
                      {user?.name || "User"}
                    </div>
                    <div style={{ fontSize: "0.75rem", color: C.dim }}>
                      {user?.email || "No email"}
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: C.dim, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Language
                  </div>
                  <div style={{
                    background: "rgba(173,255,47,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: "8px", padding: "0.75rem", color: C.accent, fontSize: "0.85rem"
                  }}>
                    Current: {selectedLang.toUpperCase()}
                    <div style={{ fontSize: "0.7rem", color: C.dim, marginTop: "0.25rem" }}>
                      Change from Navbar dropdown
                    </div>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: C.dim, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Chat Settings
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <button onClick={saveCurrentSession} style={{
                      width: "100%", padding: "0.65rem", background: "rgba(173,255,47,0.1)",
                      border: `1px solid ${C.border}`, color: C.accent, borderRadius: "8px",
                      cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textAlign: "left"
                    }}>
                      💾 Save Current Chat
                    </button>
                    <button onClick={startNewChat} style={{
                      width: "100%", padding: "0.65rem", background: "rgba(173,255,47,0.1)",
                      border: `1px solid ${C.border}`, color: C.accent, borderRadius: "8px",
                      cursor: "pointer", fontSize: "0.8rem", fontWeight: 600, textAlign: "left"
                    }}>
                      ➕ Start New Chat
                    </button>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", color: C.dim, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Storage Info
                  </div>
                  <div style={{
                    background: "rgba(173,255,47,0.04)", border: `1px solid ${C.border}`,
                    borderRadius: "8px", padding: "0.75rem", fontSize: "0.75rem", color: C.dim
                  }}>
                    <div>Current messages: {messages.length}</div>
                    <div>Saved sessions: {chatSessions.length}</div>
                    <div style={{ marginTop: "0.5rem", fontSize: "0.7rem" }}>
                      Data stored locally in browser
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <style jsx>{`
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
        aside::-webkit-scrollbar { width: 4px; }
        aside::-webkit-scrollbar-track { background: transparent; }
        aside::-webkit-scrollbar-thumb { background: rgba(173,255,47,0.15); border-radius: 4px; }
        main > div::-webkit-scrollbar { width: 4px; }
        main > div::-webkit-scrollbar-track { background: transparent; }
        main > div::-webkit-scrollbar-thumb { background: rgba(173,255,47,0.1); border-radius: 4px; }
        @media (max-width: 768px) {
          aside { width: 100% !important; height: auto !important; border-right: none !important; border-bottom: 1px solid rgba(173,255,47,0.1); }
          #dashboard-root { flex-direction: column !important; }
        }
      `}</style>
      </div>
    </ProtectedRoute>
  );
}
