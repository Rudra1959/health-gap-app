import { createSignal, For, Show, createEffect, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { supabase } from "~/lib/auth";
import { IngredientInput } from "~/components/IngredientInput";
import { TopBar } from "~/components/TopBar";
import { Sidebar } from "~/components/Sidebar";

type Message = {
  id: number;
  role: "user" | "assistant";
  content?: string;
  image?: string;
  components?: any[]; // This holds our UI cards
};

export default function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [isReady, setIsReady] = createSignal(false);
  let scrollRef: HTMLDivElement | undefined;

  // 1. Auth Guard & Initial Check
  onMount(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) navigate("/signup", { replace: true });
    else setIsReady(true);
  });

  // 2. Auto Scroll to Bottom
  createEffect(() => {
    messages();
    if (scrollRef) scrollRef.scrollTop = scrollRef.scrollHeight;
  });

  const handleSend = async (data: { text?: string; image?: string }) => {
    const userMsg: Message = { id: Date.now(), role: "user", ...data };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await fetch("https://appsbackend-production-b18b.up.railway.app/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: data.image,
          // Ensure "text" is mapped correctly to what the backend expects (barcode or manual text)
          barcode: data.text?.match(/^\d+$/) ? data.text : undefined,
          text: data.text,
        }),
      });

      const result = await response.json();

      // FIXED: Destructure result to ensure we aren't saving raw JSON objects as content
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: result.message || "Analysis complete:", // Ensure there's a string here
          components: result.components || [], // Ensure this is always an array
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: "assistant",
          content:
            "⚠️ Connection error. Please check if your backend is running.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Show
      when={isReady()}
      fallback={<div class="h-screen w-screen bg-[#FDF6E3]" />}
    >
      <div class="flex h-screen bg-[#FDF6E3] font-telegraf overflow-hidden">
        <Sidebar activeId="search" />

        <div class="flex-1 flex flex-col min-w-0 bg-white border-l-2 border-black">
          <TopBar />

          {/* Chat Area */}
          <div
            ref={scrollRef}
            class="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-32 scroll-smooth"
          >
            <For each={messages()}>
              {(msg) => (
                <div
                  class={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    class={`max-w-[85%] p-5 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] ${
                      msg.role === "user"
                        ? "bg-[#FFD9B2] rounded-l-2xl rounded-tr-2xl"
                        : "bg-white rounded-r-2xl rounded-tl-2xl"
                    }`}
                  >
                    <Show when={msg.image}>
                      <img
                        src={msg.image}
                        class="w-64 h-auto border-2 border-black mb-3 rounded-lg"
                      />
                    </Show>

                    {/* Render standard text content */}
                    <Show when={msg.content}>
                      <p class="font-bold text-lg whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    </Show>

                    {/* Render Dynamic UI Components (The Cards) */}
                    <Show when={msg.components && msg.components.length > 0}>
                      <div class="mt-4 space-y-4">
                        <For each={msg.components}>
                          {(comp) => (
                            <DynamicRenderer
                              component={comp.component}
                              props={comp.props}
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Fixed Input */}
          <div class="p-6 bg-gradient-to-t from-white via-white to-transparent">
            <IngredientInput onSend={handleSend} loading={loading()} />
          </div>
        </div>
      </div>
    </Show>
  );
}
function DynamicRenderer(props: { component: string; props: any }) {
  // If props are missing entirely, return nothing instead of crashing
  if (!props.props) return null;

  return (
    <div class="animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* 1. PRODUCT ANALYSIS CARD */}
      <Show when={props.component === "ProductAnalysis"}>
        <div class="p-4 border-2 border-black bg-[#D1FAE5] shadow-[4px_4px_0px_0px_black] rounded-xl flex items-center gap-4">
          <div class="w-16 h-16 shrink-0 border-4 border-black bg-white rounded-full flex items-center justify-center text-2xl font-black shadow-[2px_2px_0px_0px_black]">
            {/* Added fallback to '?' if score is missing */}
            {props.props?.healthScore ?? props.props?.score ?? "?"}
          </div>
          <div>
            <h4 class="font-black uppercase text-sm tracking-tight">
              {props.props?.title || "Product Info"}
            </h4>
            <p class="text-xs font-bold text-black/70 leading-tight">
              {props.props?.summary || "No description available."}
            </p>
          </div>
        </div>
      </Show>

      {/* 2. CONVERSATION PROMPTS */}
      <Show when={props.component === "ConversationPrompt"}>
        <div class="space-y-3">
          <p class="font-black text-xs uppercase opacity-40">Suggested:</p>
          <div class="flex flex-wrap gap-2">
            {/* Added fallback to empty array */}
            <For each={props.props?.suggestedQuestions || []}>
              {(q: string) => (
                <button class="px-4 py-2 bg-white border-2 border-black font-black text-xs uppercase hover:bg-black hover:text-white transition-all shadow-[2px_2px_0px_0px_black] active:shadow-none active:translate-x-[1px] active:translate-y-[1px]">
                  {q}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
