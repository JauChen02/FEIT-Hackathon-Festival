"use client";

import { useState, useRef, useEffect } from "react";
import { TutorMessage } from "@/types";
import { clsx } from "clsx";
import { Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface TutorPanelProps {
  scenarioContext?: string;
  lastChoice?: string;
  initialMessage?: string;
}

export default function TutorPanel({ scenarioContext, lastChoice, initialMessage }: TutorPanelProps) {
  const [messages, setMessages] = useState<TutorMessage[]>(() =>
    initialMessage ? [{ role: "tutor", content: initialMessage, timestamp: new Date() }] : []
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    setLoading(true);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, scenarioContext, lastChoice }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "tutor", content: data.reply, timestamp: new Date() }]);
    } catch {
      setMessages((prev) => [...prev, { role: "tutor", content: "Connection error — check your API key.", timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#1A4A8A]/40 bg-[#071428]/80 backdrop-blur overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#1A4A8A]/30 px-4 py-3.5">
        {/* Seven dots small motif */}
        <div className="flex gap-0.5">
          {["#0077B6","#0096C7","#00B4D8","#48CAE4","#90E0EF","#00B4D8","#0096C7"].map((c, i) => (
            <span key={i} className="h-1 w-1 rounded-full" style={{ backgroundColor: c }} />
          ))}
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">SAGE</p>
          <p className="text-xs text-blue-300/40">AI Security Tutor · Powered by Untapped</p>
        </div>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="mt-8 text-center">
            <p className="text-2xl mb-2">🛡️</p>
            <p className="text-xs text-blue-300/30">Ask SAGE anything about this scenario</p>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx("flex", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "tutor" && (
                <span className="mr-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#1A4A8A]/40 text-xs">
                  🤖
                </span>
              )}
              <div className={clsx(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "rounded-tr-sm bg-[#0077B6]/30 text-blue-100"
                  : "rounded-tl-sm bg-[#1A4A8A]/25 text-blue-200/90 border border-[#1A4A8A]/20"
              )}>
                {msg.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex justify-start items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#1A4A8A]/40 text-xs">🤖</span>
            <div className="rounded-2xl rounded-tl-sm bg-[#1A4A8A]/25 border border-[#1A4A8A]/20 px-4 py-2.5 flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[#4FC3F7]/60 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#1A4A8A]/30 p-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Ask about this scenario..."
            className="flex-1 rounded-xl border border-[#1A4A8A]/40 bg-[#0B1E3D]/60 px-3.5 py-2 text-sm text-blue-100 placeholder-blue-300/25 outline-none focus:border-[#2D7DD2]/60"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl transition disabled:opacity-30"
            style={{ background: "linear-gradient(135deg, #0077B6, #00B4D8)" }}
          >
            {loading
              ? <Loader2 size={14} className="animate-spin text-white" />
              : <Send size={14} className="text-white" />
            }
          </button>
        </div>
      </div>
    </div>
  );
}
