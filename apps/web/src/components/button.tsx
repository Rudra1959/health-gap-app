import { JSX, splitProps } from "solid-js";

interface Props extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  children: JSX.Element;
  variant: "green" | "orange";
}

export function ActionButton(props: Props) {
  // splitProps ensures standard button attributes (like type, disabled) work
  const [local, others] = splitProps(props, ["children", "variant", "class"]);

  const colorClasses = {
    // Exact colors from the "EatWise" design mockups
    green: "bg-[#D9FFD0] hover:bg-[#C2EBC3]",
    orange: "bg-[#FFDDA1] hover:bg-[#F7C99D]",
  };

  return (
    <button
      {...others}
      class={`
        relative px-8 py-4 
        border-[2px] border-black-700 
        rounded 
        text-black-900 
        font-bold text-2xl tracking-tight
        transition-all duration-75
        shadow-[4px_4px_0px_0px_#272525]
        active:shadow-none 
        active:translate-x-[4px] 
        active:translate-y-[4px]
        ${colorClasses[local.variant]}
        ${local.class || ""}
      `}
    >
      {local.children}
    </button>
  );
}
