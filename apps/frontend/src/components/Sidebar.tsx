import { createSignal, For } from "solid-js";

interface SidebarProps {
  activeId?: "history" | "search" | "settings";
  onTabChange?: (id: string) => void;
}

export function Sidebar(props: SidebarProps) {
  const [active, setActive] = createSignal(props.activeId ?? "history");

  const menuItems = [
    { id: "history", icon: "🕒" },
    { id: "search", icon: "🔍" },
    { id: "settings", icon: "⚙️" },
  ];

  return (
    /* Outer Container: 
      - Centers the sidebar vertically on the screen ratio
      - Adds horizontal padding to keep it off the very edge
    */
    <div class="flex flex-col justify-center   px-3">
      <aside
        /* Main Sidebar Box:
          - w-[54px]: Narrow width as seen in the Chat screen
          - h-fit: Height only as tall as the icons, not full screen
          - border-2: Solid black outline on all sides
        */
        class="w-[54px] h-fit bg-[#FDF6E3] border-2 border-black flex flex-col items-center py-6 rounded"
      >
        {/* Branding Logo: Reduced margin for smaller ratio */}
        <div class="text-[#2D6A4F] text-xl mb-7 cursor-pointer">
          <img src="leaf.png" class="w-7 h-7 object-contain" alt="Logo" />
        </div>

        {/* Menu Navigation: Tight gap-6 spacing */}
        <nav class="flex flex-col items-center gap-6">
          <For each={menuItems}>
            {(item) => {
              const isActive = () => active() === item.id;

              return (
                <button
                  onClick={() => {
                    setActive(item.id as any);
                    props.onTabChange?.(item.id);
                  }}
                  class="relative flex items-center justify-center w-9 h-9"
                >
                  {/* Active Selection: No shadow, pure border */}
                  {isActive() && (
                    <div class="absolute inset-0 bg-[#FFD9B2] border-2 border-black" />
                  )}

                  {/* Icon: text-lg to fit the smaller button ratio */}
                  <span class="relative text-lg">{item.icon}</span>
                </button>
              );
            }}
          </For>
        </nav>
      </aside>
    </div>
  );
}
