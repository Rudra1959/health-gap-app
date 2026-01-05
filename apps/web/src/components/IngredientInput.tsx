import { createSignal, Show } from "solid-js";

export function IngredientInput(props: {
  onSend: (data: { text?: string; image?: string }) => void;
}) {
  const [showMenu, setShowMenu] = createSignal(false);
  const [text, setText] = createSignal("");
  let fileInput: HTMLInputElement | undefined;

  const handleImageUpload = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Send base64 image string to the parent
        props.onSend({ image: reader.result as string });
        setShowMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div class="w-full max-w-4xl mx-auto p-6 space-y-4">
      <input
        type="file"
        accept="image/*"
        ref={fileInput}
        class="hidden"
        onChange={handleImageUpload}
      />
      <div class="relative">
        {/* Floating Action Menu */}
        <Show when={showMenu()}>
          <div class="absolute bottom-full left-0 mb-4 w-56 border-2 border-black bg-[#FDF6E3] overflow-hidden z-20">
            <button
              onClick={() => fileInput?.click()}
              class="w-full p-4 flex items-center gap-3 hover:bg-[#FFD9B2] border-b-2 border-black transition-colors"
            >
              <img src="/camera.png" class="w-5 h-5" alt="" />
              <span class="font-bold text-sm">Scan ingredients</span>
            </button>
            <button
              onClick={() => fileInput?.click()}
              class="w-full p-4 flex items-center gap-3 hover:bg-[#FFD9B2] transition-colors"
            >
              <img src="/upload.png" class="w-5 h-5" alt="" />
              <span class="font-bold text-sm">Upload Recipe</span>
            </button>
          </div>
        </Show>

        {/* Main Input Bar */}
        <div class="flex items-center border-2 border-black bg-[#FFEDD5] h-16 ]">
          <button
            onClick={() => setShowMenu(!showMenu())}
            class="h-full px-6 border-r-2 border-black hover:bg-black/5 transition-colors text-2xl"
          >
            +
          </button>
          <input
            value={text()}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && props.onSend({ text: text() })
            }
            type="text"
            placeholder="Paste ingredients here..."
            class="flex-1 bg-transparent px-6 outline-none font-medium placeholder:text-black/40"
          />
          <button
            onClick={() => {
              props.onSend({ text: text() });
              setText("");
            }}
            class="h-10 mx-3 px-6 border-2 border-black bg-[#FFD9B2] font-bold text-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
          >
            Check ingredients
          </button>
        </div>
      </div>
      <p class="text-center text-xs font-medium text-black/60 italic">
        A photo or pasted text works. I'll focus on what matters, even if it's
        messy.
      </p>
    </div>
  );
}
