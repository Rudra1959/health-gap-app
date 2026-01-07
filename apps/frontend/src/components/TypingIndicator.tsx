
export function TypingIndicator() {
  return (
    <div class="flex items-center gap-2 opacity-60">
      <span class="w-2 h-2 bg-black rounded-full animate-bounce" />
      <span class="w-2 h-2 bg-black rounded-full animate-bounce delay-150" />
      <span class="w-2 h-2 bg-black rounded-full animate-bounce delay-300" />
    </div>
  );
}
