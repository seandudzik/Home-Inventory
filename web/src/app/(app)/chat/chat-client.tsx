"use client";

import { useState, useRef, useEffect, useTransition } from "react";

interface Message {
  role: "user" | "model";
  content: string;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({ content, streaming }: { content: string; streaming?: boolean }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700">
        {content || (streaming ? <span className="inline-block h-4 w-1 animate-pulse bg-zinc-400" /> : null)}
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "What's coming up for maintenance?",
  "Do I have anything with an expiring warranty?",
  "What items are in the garage?",
  "Summarize what's overdue",
];

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);

    // Placeholder for the assistant reply
    setMessages((prev) => [...prev, { role: "model", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "model",
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "model",
          content: "Sorry, something went wrong. Please try again.",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      startTransition(() => { send(input); });
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
            <div className="text-center">
              <p className="text-lg font-medium text-zinc-800 dark:text-zinc-200">
                Ask me anything about your home
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                I have live access to your inventory, rooms, and maintenance schedule.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-750"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-2 py-4">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <UserBubble key={i} content={msg.content} />
              ) : (
                <AssistantBubble
                  key={i}
                  content={msg.content}
                  streaming={streaming && i === messages.length - 1}
                />
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 bg-zinc-50 px-2 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-end gap-2 rounded-xl border border-zinc-300 bg-white px-3 py-2 shadow-sm focus-within:border-zinc-400 focus-within:ring-2 focus-within:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-500 dark:focus-within:ring-zinc-800">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your home…"
            disabled={streaming}
            className="flex-1 resize-none bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none disabled:opacity-50 dark:text-zinc-100"
            style={{ maxHeight: "8rem", overflowY: "auto" }}
          />
          <button
            onClick={() => startTransition(() => { send(input); })}
            disabled={!input.trim() || streaming}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-white transition-colors hover:bg-zinc-700 disabled:opacity-30 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            aria-label="Send"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M8 2a.75.75 0 0 1 .75.75v8.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06L7.25 11.44V2.75A.75.75 0 0 1 8 2Z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-xs text-zinc-400">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
