import { ActionButton } from "~/components/button";
import { Title } from "@solidjs/meta";
import { ImageDeck } from "~/components/ImageDeck";
import { Sidebar } from "~/components/Sidebar";
export default function LandingPage() {
  return (
    <main>
      <div class="min-h-screen bg-[#FFF6E6] flex items-center justify-center p-8">
        <div class="max-w-7xl w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left Side Text */}
          <div class="space-y-10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10  rounded-full flex items-center justify-center">
                <img
                  src="/leaf.png"
                  alt="EatWise"
                  class="w-8 h-8 object-contain"
                />
              </div>
              <span class="text-3xl font-bold tracking-tighter">EATWISE</span>
            </div>

            <h1 class="text-8xl font-medium tracking-tight leading-[0.95] text-black">
              Understand <br /> what’s in your food.
            </h1>

            <p class="text-2xl text-gray-800 max-w-lg font-medium">
              EatWise helps you make sense of ingredients clearly, calmly, and
              honestly.
            </p>

            <div class="flex gap-6 pt-4">
              <ActionButton variant="green">Scan ingredients</ActionButton>
              <ActionButton variant="orange">
                Paste ingredient list
              </ActionButton>
            </div>
          </div>
          {/* Right Side: The Interactive Deck */}
          <div class="flex justify-center items-center h-full">
            <ImageDeck />
          </div>
          
        </div>
      </div>
    </main>
  );
}
