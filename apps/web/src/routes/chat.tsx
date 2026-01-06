// routes/chat.tsx
import { createSignal, For, Show, createEffect, onCleanup } from "solid-js";
import { IngredientInput } from "~/components/IngredientInput";
import { TopBar } from "~/components/TopBar";
import { Sidebar } from "~/components/Sidebar";

// Types matching your backend response
type BackendComponent = {
  component: string; // e.g., "ConversationPrompt"
  props: any;
};

type Message = {
  role: "user" | "assistant";
  content?: string; // For user text or simple fallback
  image?: string; // For user images
  components?: BackendComponent[]; // From backend
  id: number;
};

export default function ChatPage() {
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [loading, setLoading] = createSignal(false);
  let messagesEndRef: HTMLDivElement | undefined;

  // Auto-scroll to bottom when messages change
  createEffect(() => {
    messages(); // Dependency
    if (messagesEndRef) {
      messagesEndRef.scrollIntoView({ behavior: "smooth" });
    }
  });

  const handleSend = async (data: { text?: string; image?: string }) => {
    const newMsg: Message = {
      id: Date.now(),
      role: "user",
      content: data.text,
      image: data.image,
    };

    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);
try {
  // Check if your port is 3000, 8787, or 5173!
  const response = await fetch("http://localhost:3000/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: data.image || null,
      sessionId: "user-123",
      scanLocation: "Web App",
    }),
  });

  if (!response.ok) throw new Error("Network response was not ok");

  const result = await response.json();

  // 2. Process Backend Response
  const aiMsg: Message = {
    id: Date.now() + 1,
    role: "assistant",
    // The backend returns { components: [...] }
    components: result.components || [],
  };

  setMessages((prev) => [...prev, aiMsg]);
} catch (error) {
  console.error("Error sending message:", error);
  // Add error message to chat
  setMessages((prev) => [
    ...prev,
    {
      id: Date.now(),
      role: "assistant",
      content: "Sorry, I couldn't connect to the server. Please try again.",
    },
  ]);
} finally {
  setLoading(false);
}
  };

  return (
    <div class="flex h-screen bg-white font-telegraf overflow-hidden">
      {/* Sidebar fixed to left */}
      <Sidebar activeId="search" />

      <div class="flex-1 flex flex-col relative h-full">
        <TopBar />

        {/* Chat Scroll Area */}
        <div class="flex-1 overflow-y-auto px-6 py-6 space-y-6 pb-48">
          <Show when={messages().length === 0}>
            <div class="flex flex-col items-center justify-center h-full opacity-20 select-none">
              <span class="text-8xl">🥗</span>
              <p class="text-2xl font-bold mt-4 uppercase">Ready to scan</p>
            </div>
          </Show>

          <For each={messages()}>
            {(msg) => (
              <div
                class={`flex w-full ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  class={`max-w-[85%] sm:max-w-[70%] p-5 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-lg ${
                    msg.role === "user"
                      ? "bg-[#FFD9B2] rounded-l-2xl rounded-tr-2xl"
                      : "bg-white rounded-r-2xl rounded-tl-2xl"
                  }`}
                >
                  {/* User Image Display */}
                  <Show when={msg.image}>
                    <img
                      src={msg.image}
                      class="w-48 h-auto rounded-lg border-2 border-black mb-2"
                      alt="Uploaded scan"
                    />
                  </Show>

                  {/* User Text Display */}
                  <Show when={msg.content}>
                    <p class="whitespace-pre-wrap font-medium">{msg.content}</p>
                  </Show>

                  {/* AI Dynamic Component Rendering */}
                  <Show when={msg.role === "assistant" && msg.components}>
                    <div class="space-y-4">
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

          {/* Invisible element to scroll to */}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area (Fixed Bottom) */}
        
          <IngredientInput onSend={handleSend} loading={loading()} />
        
      </div>
    </div>
  );
}

// 3. Helper to Render Backend Components
// This maps the string name from your backend ("ConversationPrompt", etc.) to UI
function DynamicRenderer(props: { component: string; props: any }) {
  return (
    <div class="font-telegraf">
      <Show when={props.component === "ConversationPrompt"}>
        <div class="space-y-3">
          <p class="font-bold text-xl leading-tight">{props.props.message}</p>

          <Show when={props.props.productType}>
            <div class="inline-block px-3 py-1 bg-[#D1FAE5] border-2 border-black rounded-full text-xs font-bold uppercase tracking-wider">
              Detected: {props.props.productType}
            </div>
          </Show>

          <Show when={props.props.suggestedQuestions}>
            <div class="flex flex-wrap gap-2 pt-2">
              <For each={props.props.suggestedQuestions}>
                {(q: string) => (
                  <button class="px-3 py-2 bg-white border border-black rounded-lg text-sm font-medium hover:bg-black hover:text-white transition-colors">
                    {q}
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>

      {/* Fallback for "ProductAnalysis" or other components */}
      <Show when={props.component !== "ConversationPrompt"}>
        <div class="space-y-2">
          <h3 class="font-bold text-lg uppercase underline decoration-2">
            {props.props.title || "Analysis"}
          </h3>
          <p>
            {props.props.message ||
              props.props.analysis ||
              JSON.stringify(props.props)}
          </p>

          {/* Render Health Score if available */}
          <Show when={props.props.healthScore !== undefined}>
            <div class="mt-4 flex items-center gap-4">
              <div class="w-16 h-16 flex items-center justify-center border-2 border-black bg-green-400 rounded-full font-black text-2xl">
                {props.props.healthScore}
              </div>
              <span class="font-bold uppercase text-sm">Health Score</span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
