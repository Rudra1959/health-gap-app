import { createSignal, onMount } from "solid-js";
import { supabase } from "~/lib/auth";
export function TopBar() {
  const [avatar, setAvatar] = createSignal<string | null>(null);

  onMount(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.user_metadata?.avatar_url) {
      setAvatar(user.user_metadata.avatar_url);
    }
  });
  return (
    <header
      /* h-14 matches the slim height ratio in the chat design
         bg-[#FDF6E3] is the exact cream background */
      class="w-full h-14 border-b-2 flex items-center justify-between px-6 bg-[#FDF6E3] sticky top-0 z-40"
    >
      {/* Left Section: Branding */}
      <div class="flex items-center gap-3">
        <div class="w-6 h-6 flex items-center justify-center">
          {/* Put your leaf PNG path here */}
          <img src="leaf.png" class="w-full h-full object-contain" alt="Logo" />
        </div>
        <span class="font-bold tracking-tighter text-lg uppercase text-black">
          EATWISE
        </span>
      </div>

      {/* Right Section: Utility Icons */}
      <div class="flex items-center gap-3">
        {/* Notification Button - Flat style, no shadow as per design */}
        <button class="w-9 h-9 border-2 border-black flex items-center justify-center bg-[#FFD9B2] hover:bg-[#ffcd9b] transition-colors">
          {/* Put your bell PNG path here */}
          <img
            src="/bell.png"
            class="w-5 h-5 object-contain"
            alt="Notifications"
          />
        </button>

        {/* Help Button */}
        <button class="w-9 h-9 border-2 border-black flex items-center justify-center bg-[#FFD9B2] hover:bg-[#ffcd9b] transition-colors">
          {/* Put your help/question PNG path here */}
          <img src="/help.png" class="w-5 h-5 object-contain" alt="Help" />
        </button>

        {/* Profile Image with exact border and sizing */}
        <div class="w-9 h-9 border-2 border-black overflow-hidden bg-gray-200">
          <img
            src={avatar() || "/default-avatar.png"}
            class="w-full h-full object-cover"
            alt="User Profile"
          />
        </div>
      </div>
    </header>
  );
}
