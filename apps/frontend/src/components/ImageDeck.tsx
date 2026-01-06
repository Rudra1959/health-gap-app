import { createSignal, For, onMount, onCleanup } from "solid-js";

export function ImageDeck() {
  const images = [
    "/1.png",
    "/2.png",
    "/3.png",
    "/4.png",
    "/5.png",
    "/6.png",
    "/7.png",
    "/8.png",
    "/9.png",
  ];
  const [activeIndex, setActiveIndex] = createSignal(0);

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % images.length);
  };

  onMount(() => {
    // Fixed: 3500ms for 3.5 seconds
    const interval = setInterval(handleNext, 3500);
    onCleanup(() => clearInterval(interval));
  });

  return (
    <div
      class="relative w-full max-w-[600px] h-[630px] cursor-pointer perspective-1000"
      onClick={handleNext}
    >
      <For each={images}>
        {(src, index) => {
          // Logic for card state
          const isGone = index() < activeIndex();
          const isCurrent = index() === activeIndex();

          // To match the design, cards peek out from the bottom-right
          // We apply a consistent progressive offset
          const depthOffset = (index() - activeIndex()) * 2;
          const stackRotation = (index() % 2 === 0 ? 1 : -1) * (index() * 0.5);

          return (
            <div
              class="absolute inset-0 transition-all duration-[900ms] cubic-bezier(0.23, 1, 0.32, 1)"
              style={{
                "z-index": images.length - index(),
                opacity: isGone ? 0 : 1,
                transform: isGone
                  ? `translate(-120px, 110vh) rotate(-35deg) scale(0.8)` // Sideways "Fall"
                  : isCurrent
                    ? `translate(0px, 0px) rotate(0deg) scale(1)`
                    : `translate(${depthOffset}px, ${depthOffset}px) rotate(${stackRotation}deg)`,
                "pointer-events": isCurrent ? "auto" : "none",
              }}
            >
              {/* Thick white border and heavy rounded corners from design */}
              <div class="w-full h-full rounded-[40px] overflow-hidden border-[2px] border-white shadow-[20px_20px_50px_rgba(0,0,0,0.15)] bg-white">
                <img
                  src={src}
                  alt="Food Item"
                  class="w-full h-full object-cover select-none pointer-events-none"
                />
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
