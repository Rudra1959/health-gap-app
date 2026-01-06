import { createSignal, Show, onMount, onCleanup } from "solid-js";

type InputProps = {
  onSend: (data: { text?: string; image?: string }) => void;
  loading?: boolean;
};

export function IngredientInput(props: InputProps) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [text, setText] = createSignal("");
  let fileInputRef: HTMLInputElement | undefined;
  let cameraInputRef: HTMLInputElement | undefined;

  // 1. Handle File/Camera Selection
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      props.onSend({ image: reader.result as string });
      setShowMenu(false);
    };
    reader.readAsDataURL(file);
  };

  const onFileChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
  };

  // 2. Real AI Chat Feature: Paste Image Support (Ctrl+V)
  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) handleFile(file);
      }
    }
  };

  onMount(() => window.addEventListener("paste", handlePaste));
  onCleanup(() => window.removeEventListener("paste", handlePaste));

  const handleTextSend = () => {
    if (text().trim() && !props.loading) {
      props.onSend({ text: text() });
      setText("");
    }
  };

  return (
    <div class="w-full max-w-4xl mx-auto p-6 space-y-4 font-telegraf relative">
      {/* Hidden Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={onFileChange}
        accept="image/*"
        class="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={onFileChange}
        accept="image/*"
        capture="environment"
        class="hidden"
      />

      <div class="relative">
        {/* Floating Menu */}
        <Show when={showMenu()}>
          <div class="absolute bottom-[calc(100%+10px)] left-0 w-56 border-4 border-black bg-white z-50 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <button
              onClick={() => cameraInputRef?.click()}
              class="w-full p-4 text-left bg-[#D1FAE5] border-b-4 border-black hover:bg-[#A7F3D0] flex items-center gap-3 transition-colors"
            >
              <span class="text-xl">📸</span>
              <span class="font-black text-sm uppercase tracking-tight">
                Open Camera
              </span>
            </button>
            <button
              onClick={() => fileInputRef?.click()}
              class="w-full p-4 text-left bg-[#FFD9B2] hover:bg-[#ffcd9b] flex items-center gap-3 transition-colors"
            >
              <span class="text-xl">🖼️</span>
              <span class="font-black text-sm uppercase tracking-tight">
                Upload Image
              </span>
            </button>
          </div>
        </Show>

        {/* Main Input Bar */}
        <div class="flex items-center border-4 border-black bg-[#FFEDD5] h-16 relative z-40 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          {/* Plus Button Area */}
          <div class="h-full aspect-square border-r-4 border-black bg-[#FFD9B2] flex items-center justify-center">
            <button
              onClick={() => setShowMenu(!showMenu())}
              class={`text-4xl font-black w-full h-full flex items-center justify-center transition-transform duration-200 ${showMenu() ? "rotate-45" : ""}`}
            >
              +
            </button>
          </div>

          <input
            type="text"
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTextSend()}
            placeholder={
              props.loading
                ? "Analyzing Ingredients..."
                : "Paste ingredients or image..."
            }
            disabled={props.loading}
            class="flex-1 bg-transparent px-6 outline-none font-bold placeholder:text-black/20 text-xl"
          />

          <button
            onClick={handleTextSend}
            disabled={props.loading || !text().trim()}
            class="h-10 mr-3 px-6 border-2 border-black bg-[#FFD9B2] font-black text-sm uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all "
          >
            {props.loading ? "..." : "Check"}
          </button>
        </div>
      </div>

      <p class="text-center text-sm font-black uppercase tracking-widest text-black/40">
        Scan label • Paste text • Get truth
      </p>
    </div>
  );
}
