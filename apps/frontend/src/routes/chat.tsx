import { createSignal, For, Show, createEffect, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase } from "~/lib/auth";

import { Sidebar } from "~/components/Sidebar";
import { TopBar } from "~/components/TopBar";
import { IngredientInput } from "~/components/IngredientInput";
import { ChatBubble } from "~/components/ChatBubble";
import { EmptyState } from "~/components/EmptyState";
import { TypingIndicator } from "~/components/TypingIndicator";

/* =====================================================
   Types
===================================================== */
type Message = {
  id: number;
  role: "user" | "assistant";
  content?: string;
  image?: string;
  components?: any[];
};

/* =====================================================
   LocalStorage helper (SSR-safe)
===================================================== */
const STORAGE_KEY = "eatwise_chat";

function getStore(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

const HISTORY_LIMIT = 0; // 🔥 token control

export default function ChatPage() {
  const navigate = useNavigate();

  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [ready, setReady] = createSignal(false);

  let scrollRef: HTMLDivElement | undefined;

  /* =====================================================
     AUTH + RESTORE CHAT (CLIENT ONLY)
  ===================================================== */
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      navigate("/signup", { replace: true });
      return;
    }

    const store = getStore();
    if (store) {
      try {
        const saved = store.getItem(STORAGE_KEY);
        if (saved) setMessages(JSON.parse(saved));
      } catch {
        store.removeItem(STORAGE_KEY);
      }
    }

    setReady(true);
  });

  /* =====================================================
     SAVE CHAT (CLIENT ONLY)
  ===================================================== */
  createEffect(() => {
    const store = getStore();
    if (!store) return;
    store.setItem(STORAGE_KEY, JSON.stringify(messages()));
  });

  /* =====================================================
     AUTO SCROLL
  ===================================================== */
  createEffect(() => {
    messages();
    queueMicrotask(() => {
      if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
    });
  });

  /* =====================================================
     SEND MESSAGE (SAFE + RATE-LIMIT AWARE)
  ===================================================== */
  async function sendMessage(payload: { text?: string; image?: string }) {
    if (loading()) return;

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: payload.text,
      image: payload.image,
    };

    const updated = [...messages(), userMsg];
    setMessages(updated);
    setLoading(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.slice(-HISTORY_LIMIT).map((m) => ({
            role: m.role,
            content: m.content ?? "",
          })),
        }),
      });

      const data = await res.json();

      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content:
            data.message ??
            "I’m temporarily overloaded. Please try again shortly.",
          components: data.components ?? [],
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: "⚠️ Unable to reach server. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /* =====================================================
     UI
  ===================================================== */
  return (
    <Show when={ready()}>
      <div class="flex h-screen bg-[#FDF6E3] overflow-hidden font-telegraf">
        <Sidebar activeId="search" />

        <div class="flex-1 flex flex-col bg-white border-l-2 border-black">
          <TopBar />

          <div
            ref={scrollRef}
            class="flex-1 overflow-y-auto p-6 space-y-6 pb-40"
          >
            <Show when={messages().length > 0} fallback={<EmptyState />}>
              <For each={messages()}>
                {(msg) => <ChatBubble message={msg} />}
              </For>
            </Show>

            <Show when={loading()}>
              <TypingIndicator />
            </Show>
          </div>

          <div class="fixed bottom-0 left-[80px] right-0 bg-gradient-to-t from-white via-white to-transparent">
            <IngredientInput loading={loading()} onSend={sendMessage} />
          </div>
        </div>
      </div>
    </Show>
  );
}
