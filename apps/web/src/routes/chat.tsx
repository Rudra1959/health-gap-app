import { createSignal, For } from "solid-js";
import { IngredientInput } from "~/components/IngredientInput";

export function ChatPage() {
  const [messages, setMessages] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(false);

  const sendMessage = async (data: { text?: string; image?: string }) => {
    // 1. Add User Message to UI
    const userMsg = {
      role: "user",
      content: data.text || "Scanning image...",
      type: "text",
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const response = await fetch("http://localhost:3000/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: data.image, // Base64 string from input
          sessionId: "user-123",
          scanLocation: "Web App",
        }),
      });

      const result = await response.json();

      // 2. Handle AI response (Dynamic UI Components from backend)
      // Your backend returns an array of components like 'ConversationPrompt'
      const aiMsg = {
        role: "assistant",
        components: result.components,
        status: result.status,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.error("Scan failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex flex-col h-screen bg-[#FDF6E3] font-telegraf">
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <For each={messages()}>
          {(msg) => (
            <div
              class={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                class={`max-w-md p-4 border-2 border-black shadow-[4px_4px_0px_0px_black] ${
                  msg.role === "user"
                    ? "bg-[#FFD9B2] rounded-l-xl rounded-tr-xl"
                    : "bg-white rounded-r-xl rounded-tl-xl"
                }`}
              >
                {/* Render Dynamic Components */}
                <Show when={msg.role === "assistant"} fallback={msg.content}>
                  <For each={msg.components}>
                    {(comp: any) => (
                      <div class="space-y-2">
                        <p class="font-bold">
                          {comp.props.message || comp.props.analysis}
                        </p>
                        <Show when={comp.props.suggestedQuestions}>
                          <div class="flex flex-wrap gap-2 mt-2">
                            <For each={comp.props.suggestedQuestions}>
                              {(q) => (
                                <button class="bg-[#FFEDD5] border border-black px-2 py-1 text-xs rounded-full">
                                  {q}
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
      <IngredientInput onSend={sendMessage} />
    </div>
  );
}
