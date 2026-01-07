import { Show, For } from "solid-js";

export function DynamicRenderer(props: { component: string; props: any }) {
  if (!props.props) return null;

  return (
    <>
      <Show when={props.component === "ProductAnalysis"}>
        <div class="p-4 bg-[#D1FAE5] border-2 border-black rounded-xl shadow-[4px_4px_0px_black] flex gap-4">
          <div class="w-14 h-14 flex items-center justify-center bg-white border-4 border-black rounded-full font-black text-xl">
            {props.props.healthScore ?? "?"}
          </div>
          <div>
            <h4 class="font-black uppercase text-sm">{props.props.title}</h4>
            <p class="text-xs font-bold opacity-70">{props.props.summary}</p>
          </div>
        </div>
      </Show>

      <Show when={props.component === "ConversationPrompt"}>
        <div class="flex flex-wrap gap-2">
          <For each={props.props.suggestedQuestions}>
            {(q: string) => (
              <button class="px-4 py-2 border-2 border-black font-black text-xs bg-white hover:bg-black hover:text-white">
                {q}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}
