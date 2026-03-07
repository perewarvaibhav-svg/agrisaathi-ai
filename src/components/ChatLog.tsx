"use client";
import { useState, useEffect, useRef } from "react";

/* ─── Types ─── */
export interface Message {
    id: number;
    role: "user" | "ai";
    text: string;
    timestamp?: number;
}

export interface ChatSession {
    id: string;
    title: string;
    date: string;
    preview: string;
    messages: Message[];
}

interface Props {
    userId: string;
    currentMessages: Message[];
    onLoadSession: (msgs: Message[]) => void;
    onNewChat: () => void;
    onClose: () => void;
}

const C = {
    bg: "#0d120d",
    border: "rgba(173,255,47,0.12)",
    accent: "#ADFF2F",
    dim: "rgba(173,255,47,0.5)",
    panel: "rgba(173,255,47,0.04)",
    danger: "rgba(255,80,80,0.15)",
    dangerBorder: "rgba(255,80,80,0.3)",
    dangerText: "#ff6b6b",
};

const STORAGE_KEY = (uid: string) => `agrisaathi_sessions_${uid}`;
const CURRENT_KEY = (uid: string) => `agrisaathi_chat_${uid}`;

function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
}

export default function ChatLog({ userId, currentMessages, onLoadSession, onNewChat, onClose }: Props) {
    const [sessions, setSessions] = useState<ChatSession[]>([]);
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    /* ── Load sessions from localStorage ── */
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY(userId));
            if (raw) setSessions(JSON.parse(raw));
        } catch { /* ignore */ }
        setTimeout(() => searchRef.current?.focus(), 100);
    }, [userId]);

    /* ── Save helper ── */
    const persist = (updated: ChatSession[]) => {
        setSessions(updated);
        localStorage.setItem(STORAGE_KEY(userId), JSON.stringify(updated));
    };

    /* ── Save current chat as a new session ── */
    const saveCurrentChat = () => {
        if (currentMessages.length === 0) return;
        const title = currentMessages.find(m => m.role === "user")?.text.slice(0, 55) ?? "Chat";
        const preview = currentMessages.find(m => m.role === "ai")?.text.slice(0, 90) ?? "";
        const session: ChatSession = {
            id: Date.now().toString(),
            title: title + (title.length >= 55 ? "…" : ""),
            date: new Date().toLocaleDateString("en-IN"),
            preview,
            messages: currentMessages.map(m => ({ ...m, timestamp: m.timestamp ?? Date.now() })),
        };
        persist([session, ...sessions].slice(0, 50));
    };

    /* ── Delete one session ── */
    const deleteSession = (id: string) => {
        persist(sessions.filter(s => s.id !== id));
        setConfirmDelete(null);
    };

    /* ── Clear all sessions ── */
    const clearAll = () => {
        persist([]);
        localStorage.removeItem(CURRENT_KEY(userId));
        setConfirmDelete(null);
    };

    /* ── Export session as .txt ── */
    const exportSession = (session: ChatSession) => {
        const lines = session.messages.map(m =>
            `[${m.role.toUpperCase()}] ${m.text}`
        ).join("\n\n");
        const blob = new Blob([`AgriSaathi Chat — ${session.title}\n${"═".repeat(50)}\n\n${lines}`], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `agrisaathi-chat-${session.id}.txt`;
        a.click();
    };

    const filtered = sessions.filter(s =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.preview.toLowerCase().includes(search.toLowerCase())
    );

    const btn = (extra?: React.CSSProperties): React.CSSProperties => ({
        background: "transparent",
        border: `1px solid ${C.border}`,
        color: C.accent,
        borderRadius: "6px",
        padding: "0.3rem 0.65rem",
        fontSize: "0.72rem",
        fontWeight: 600,
        cursor: "pointer",
        transition: "all 0.15s",
        ...extra,
    });

    return (
        <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: "360px", background: C.bg,
            borderLeft: `1px solid ${C.border}`,
            display: "flex", flexDirection: "column",
            zIndex: 2000,
            boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
            animation: "slideIn 0.25s ease",
        }}>
            <style>{`
                @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                .cl-session:hover { background: rgba(173,255,47,0.07) !important; }
                .cl-btn:hover { background: rgba(173,255,47,0.12) !important; }
            `}</style>

            {/* ── Header ── */}
            <div style={{
                padding: "1.25rem 1.25rem 1rem",
                borderBottom: `1px solid ${C.border}`,
                flexShrink: 0,
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <span style={{ color: C.accent, fontWeight: 700, fontSize: "1rem" }}>📜 Chat History</span>
                    <button onClick={onClose} style={{ ...btn(), fontSize: "1.1rem", padding: "0.2rem 0.6rem" }}>✕</button>
                </div>

                {/* Search */}
                <input
                    ref={searchRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search sessions…"
                    style={{
                        width: "100%", background: "rgba(173,255,47,0.04)",
                        border: `1px solid ${C.border}`, color: C.accent,
                        borderRadius: "8px", padding: "0.55rem 0.9rem",
                        outline: "none", fontSize: "0.85rem", fontFamily: "inherit",
                        boxSizing: "border-box",
                    }}
                />

                {/* Action row */}
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
                    <button
                        className="cl-btn"
                        onClick={saveCurrentChat}
                        disabled={currentMessages.length === 0}
                        style={{ ...btn({ flex: 1, opacity: currentMessages.length === 0 ? 0.4 : 1 }) }}
                    >
                        💾 Save Current
                    </button>
                    <button
                        className="cl-btn"
                        onClick={() => { saveCurrentChat(); onNewChat(); }}
                        style={{ ...btn({ flex: 1 }) }}
                    >
                        ➕ New Chat
                    </button>
                </div>
            </div>

            {/* ── Session list ── */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem" }}>
                {filtered.length === 0 ? (
                    <div style={{ textAlign: "center", color: C.dim, fontSize: "0.82rem", padding: "3rem 1rem" }}>
                        {search ? "No sessions match your search." : "No saved sessions yet.\nStart chatting and hit Save!"}
                    </div>
                ) : (
                    filtered.map(session => (
                        <div key={session.id}
                            className="cl-session"
                            style={{
                                background: C.panel,
                                border: `1px solid ${C.border}`,
                                borderRadius: "10px",
                                padding: "0.85rem",
                                marginBottom: "0.6rem",
                                transition: "background 0.15s",
                            }}
                        >
                            {/* Title + meta */}
                            <div
                                onClick={() => { onLoadSession(session.messages); onClose(); }}
                                style={{ cursor: "pointer" }}
                            >
                                <div style={{
                                    color: C.accent, fontWeight: 600,
                                    fontSize: "0.85rem", marginBottom: "0.3rem",
                                    lineHeight: 1.3,
                                }}>
                                    {session.title}
                                </div>
                                {session.preview && (
                                    <div style={{
                                        color: C.dim, fontSize: "0.73rem",
                                        lineHeight: 1.5, marginBottom: "0.5rem",
                                        display: "-webkit-box", WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical" as const, overflow: "hidden",
                                    }}>
                                        {session.preview}
                                    </div>
                                )}
                                <div style={{ color: C.dim, fontSize: "0.68rem" }}>
                                    {session.date} · {session.messages.length} messages
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.65rem" }}>
                                <button
                                    className="cl-btn"
                                    onClick={() => { onLoadSession(session.messages); onClose(); }}
                                    style={{ ...btn({ flex: 1, fontSize: "0.7rem" }) }}
                                >
                                    📂 Load
                                </button>
                                <button
                                    className="cl-btn"
                                    onClick={() => exportSession(session)}
                                    style={{ ...btn({ fontSize: "0.7rem" }) }}
                                >
                                    ⬇ Export
                                </button>
                                {confirmDelete === session.id ? (
                                    <>
                                        <button
                                            onClick={() => deleteSession(session.id)}
                                            style={{ ...btn({ background: C.danger, borderColor: C.dangerBorder, color: C.dangerText, fontSize: "0.7rem" }) }}
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            onClick={() => setConfirmDelete(null)}
                                            style={{ ...btn({ fontSize: "0.7rem" }) }}
                                        >
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => setConfirmDelete(session.id)}
                                        style={{ ...btn({ borderColor: C.dangerBorder, color: C.dangerText, fontSize: "0.7rem" }) }}
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* ── Footer ── */}
            {sessions.length > 0 && (
                <div style={{ padding: "0.75rem 1rem", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
                    <div style={{ color: C.dim, fontSize: "0.7rem", marginBottom: "0.6rem" }}>
                        {sessions.length} session{sessions.length !== 1 ? "s" : ""} saved locally
                    </div>
                    {confirmDelete === "ALL" ? (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button onClick={clearAll} style={{ ...btn({ flex: 1, background: C.danger, borderColor: C.dangerBorder, color: C.dangerText }) }}>
                                Yes, delete all
                            </button>
                            <button onClick={() => setConfirmDelete(null)} style={{ ...btn({ flex: 1 }) }}>
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete("ALL")}
                            style={{ ...btn({ width: "100%", borderColor: C.dangerBorder, color: C.dangerText }) }}
                        >
                            🗑️ Clear All History
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
