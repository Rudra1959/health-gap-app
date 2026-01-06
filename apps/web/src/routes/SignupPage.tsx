import { useNavigate, A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal } from "solid-js";

export default function SignupPage() {
  const navigate = useNavigate();

  // Real Form State
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [agree, setAgree] = createSignal(false);
  const [error, setError] = createSignal("");

  const handleSignup = (e: Event) => {
    e.preventDefault();
    setError("");

    // Simple Real Validation
    if (!email().includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    if (password().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (!agree()) {
      setError("You must agree to the terms.");
      return;
    }

    // If valid, navigate to chat
    navigate("/chat");
  };

  return (
    <div class="min-h-screen bg-[#FDF6E3] flex items-center justify-center font-telegraf p-4">
      <Title>Join EatWise</Title>

      <div class="w-full max-w-lg p-10 border-4 border-black bg-white shadow-[8px_8px_2px_2px_rgba(0,0,0,1)]">
        <h1 class="text-4xl font-black mb-2 tracking-tighter uppercase">
          Join EatWise
        </h1>
        <p class="mb-8 font-medium text-black/60">
          Start understanding your food today.
        </p>

        {/* Error Message Display */}
        {error() && (
          <div class="mb-6 p-3 border-2 border-black bg-red-100 font-bold text-sm text-red-600">
            ⚠️ {error()}
          </div>
        )}

        <form onSubmit={handleSignup} class="space-y-4">
          <div class="space-y-1">
            <label class="font-bold text-sm uppercase">Email Address</label>
            <input
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              placeholder="hello@example.com"
              class="w-full p-4 border-2 border-black outline-none font-bold placeholder:text-black/20 focus:bg-[#FFEDD5] transition-colors"
            />
          </div>

          <div class="space-y-1">
            <label class="font-bold text-sm uppercase">Password</label>
            <div class="relative">
              <input
                type={showPassword() ? "text" : "password"}
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder="••••••••"
                class="w-full p-4 border-2 border-black outline-none font-bold placeholder:text-black/20 focus:bg-[#FFEDD5] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword())}
                class="absolute right-4 top-1/2 -translate-y-1/2 font-bold text-xs underline uppercase"
              >
                {showPassword() ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {/* Terms Checkbox */}
          <div class="flex items-start gap-3 py-2">
            <input
              type="checkbox"
              id="terms"
              checked={agree()}
              onChange={(e) => setAgree(e.currentTarget.checked)}
              class="mt-1 w-5 h-5 border-2 border-black accent-black cursor-pointer"
            />
            <label
              for="terms"
              class="text-xs font-medium leading-tight cursor-pointer"
            >
              I agree to the{" "}
              <span class="underline font-bold">Terms of Service</span> and
              <span class="underline font-bold"> Privacy Policy</span>.
            </label>
          </div>

          <button
            type="submit"
            class="w-full py-4 bg-[#FFD9B2] border-2 border-black font-bold text-xl uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
          >
            Create Account
          </button>
        </form>

        <div class="relative flex py-6 items-center">
          <div class="flex-grow border-t-2 border-black"></div>
          <span class="flex-shrink mx-4 font-bold text-xs uppercase text-black/40">
            Or 
          </span>
          <div class="flex-grow border-t-2 border-black"></div>
        </div>

        <button
          onClick={() => navigate("/chat")}
          class="w-full py-4 bg-white border-2 border-black font-bold text-lg flex items-center justify-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
        >
          <svg class="w-6 h-6" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google
        </button>

        <p class="mt-8 text-center font-bold text-sm">
          Already a member?{" "}
          <A href="/login" class="underline decoration-2">
            Sign In
          </A>
        </p>
      </div>
    </div>
  );
}
