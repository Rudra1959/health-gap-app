import { For, Show } from "solid-js";

// 1. Generic Card for Text/Analysis
export function ConversationPrompt(props: any) {
  return (
    <div class="space-y-3">
      <p class="font-medium text-lg leading-relaxed">
        {props.message || props.analysis}
      </p>

      {/* Render Suggested Questions if they exist */}
      <Show
        when={props.suggestedQuestions && props.suggestedQuestions.length > 0}
      >
        <div class="flex flex-wrap gap-2 mt-3">
          <For each={props.suggestedQuestions}>
            {(q) => (
              <button class="bg-white border-2 border-black px-3 py-1.5 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all">
                {q}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// 2. Health Score Card (for when analysis is complete)
export function HealthScore(props: any) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "bg-[#D1FAE5]"; // Green
    if (score >= 50) return "bg-[#FFD9B2]"; // Orange
    return "bg-[#FFCaca]"; // Red
  };

  return (
    <div class="mt-4 p-4 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div class="flex items-center justify-between mb-2">
        <h3 class="font-bold text-xl uppercase tracking-tight">Health Score</h3>
        <div
          class={`w-12 h-12 flex items-center justify-center border-2 border-black rounded-full font-black text-lg ${getScoreColor(props.score || 0)}`}
        >
          {props.score}
        </div>
      </div>
      <p class="text-sm font-medium opacity-80">
        {props.summary || "Based on your nutritional preferences."}
      </p>
    </div>
  );
}

// 3. The "Master" Component that decides what to render
export function DynamicAiComponent(props: {
  componentName: string;
  data: any;
}) {
  return (
    <div class="mb-4">
      <Show when={props.componentName === "ConversationPrompt"}>
        <ConversationPrompt {...props.data} />
      </Show>
      <Show
        when={
          props.componentName === "HealthScore" ||
          props.componentName === "ScoreCard"
        }
      >
        <HealthScore {...props.data} />
      </Show>
      {/* Fallback for unknown components */}
      <Show when={props.componentName === "AnalysisResult"}>
        <ConversationPrompt message={props.data.analysis} />
      </Show>
    </div>
  );
}
