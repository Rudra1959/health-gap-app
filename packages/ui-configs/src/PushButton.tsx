import { JSX, splitProps } from "solid-js";

interface PushButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string; // e.g., "bg-blue-500"
  shadowColor?: string; // e.g., "bg-blue-800"
  children: JSX.Element;
}

export function PushButton(props: PushButtonProps) {
  // Separate custom props from standard button attributes
  const [local, others] = splitProps(props, [
    "color",
    "shadowColor",
    "children",
    "class",
  ]);

  const bgColor = local.color || "bg-indigo-500";
  const shadowColor = local.shadowColor || "bg-indigo-800";

  return (
    <button
      {...others}
      class={`relative group outline-none active:outline-none ${local.class || ""}`}
    >
      {/* The Bottom Layer (The "Shadow" that stays still) */}
      <span
        class={`absolute inset-0 translate-y-1.5 rounded-xl ${shadowColor}`}
      />

      {/* The Top Layer (The actual button that moves) */}
      <span
        class={`relative block px-8 py-3 rounded-xl text-white font-bold transform transition-transform duration-75 
                ${bgColor} 
                group-hover:-translate-y-0.5 
                group-active:translate-y-1.5`}
      >
        {local.children}
      </span>
    </button>
  );
}
