import { Show, For } from "solid-js";
import { DynamicRenderer } from "./DynamicRenderer";

export function ChatBubble(props: { message: any }) {
  const msg = props.message;

  // ✅ HARD GUARD — prevents empty bubbles
  const hasContent =
    Boolean(msg.content && msg.content.trim()) ||
    Boolean(msg.image) ||
    Boolean(msg.components && msg.components.length > 0);

  if (!hasContent) return null;

  return (
    <div
      class={`flex w-full ${
        msg.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      <div
        class={`max-w-[85%] p-5 border-2 border-black shadow-[4px_4px_0px_0px_black] ${
          msg.role === "user"
            ? "bg-[#FFD9B2] rounded-l-2xl rounded-tr-2xl"
            : "bg-white rounded-r-2xl rounded-tl-2xl"
        }`}
      >
        {/* Image */}
        <Show when={msg.image}>
          <img
            src={msg.image}
            class="w-64 h-auto border-2 border-black mb-3 rounded-lg"
          />
        </Show>

        {/* Text */}
        <Show when={msg.content && msg.content.trim()}>
          <p class="font-bold text-lg whitespace-pre-wrap">{msg.content}</p>
        </Show>

        {/* Components */}
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
  );
}
