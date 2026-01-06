import { useNavigate, A } from "@solidjs/router";
import { Title } from "@solidjs/meta";
import { createSignal, onMount , Show } from "solid-js";
import { supabase } from "~/lib/auth"; // Ensure this path matches your setup

export default function SignupPage() {
  const navigate = useNavigate();

  // Form State
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [showPassword, setShowPassword] = createSignal(false);
  const [agree, setAgree] = createSignal(false);
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [hasChecked, setHasChecked] = createSignal(false); // NEW: Track if check is done
  onMount(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      navigate("/chat", { replace: true });
    } else {
      setHasChecked(true); // Only show the page if NOT logged in
    }
  });

  // 2. Real Google Sign In
  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/chat`,
      },
    });
    if (error) setError(error.message);
  };

  // 3. Real Email Signup/Login Logic
  const handleSignup = async (e: Event) => {
    e.preventDefault();
    setError("");

    if (!agree()) {
      setError("You must agree to the terms.");
      return;
    }

    setLoading(true);

    // Step A: Try to Login first (in case they already have an account)
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email(),
        password: password(),
      });

    if (signInError) {
      // Step B: If login fails, try to Sign Up (create new account)
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: email(),
          password: password(),
        });

      if (signUpError) {
        setError(signUpError.message);
      } else if (signUpData.user && signUpData.session) {
        // Logged in immediately after signup
        navigate("/chat");
      } else {
        // Email confirmation is likely enabled in Supabase
        setError("Check your email to confirm your account!");
      }
    } else {
      // Login successful
      navigate("/chat");
    }

    setLoading(false);
  };

  return (
    <Show when={hasChecked()} fallback={<div class="h-screen w-screen bg-[#FDF6E3] flex items-center justify-center font-black">LOADING...</div>}>
    <div class="min-h-screen bg-[#FDF6E3] flex items-center justify-center font-telegraf p-4">
      <Title>Join EatWise</Title>

      <div class="w-full max-w-lg p-10 border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <h1 class="text-4xl font-black mb-2 tracking-tighter uppercase">
          Join EatWise
        </h1>
        <p class="mb-8 font-medium text-black/60">
          Start understanding your food today.
        </p>

        {/* Error Message Display */}
        {error() && (
          <div class="mb-6 p-3 border-2 border-black bg-red-100 font-bold text-sm text-red-600 animate-pulse">
            ⚠️ {error()}
          </div>
        )}

        <form onSubmit={handleSignup} class="space-y-4">
          <div class="space-y-1">
            <label class="font-bold text-sm uppercase">Email Address</label>
            <input
              type="email"
              required
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
                required
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
              I agree to the <span class="underline font-bold">Terms</span> and{" "}
              <span class="underline font-bold">Privacy</span>.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading()}
            class="w-full py-4 bg-[#FFD9B2] border-2 border-black font-bold text-xl uppercase shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all disabled:opacity-50"
          >
            {loading() ? "Verifying..." : "Create Account"}
          </button>
        </form>

        <div class="relative flex py-6 items-center">
          <div class="flex-grow border-t-2 border-black"></div>
          <span class="flex-shrink mx-4 font-bold text-xs uppercase text-black/40">
            Or
          </span>
          <div class="flex-grow border-t-2 border-black"></div>
        </div>

        {/* Real Google Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          class="w-full py-4 bg-white border-2 border-black font-bold text-lg flex items-center justify-center gap-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
        >
          <img
            src="https://www.google.com/favicon.ico"
            class="w-6 h-6"
            alt="Google"
          />
          Continue with Google
        </button>

        <p class="mt-8 text-center font-bold text-sm">
          Already have an account?{" "}
          <A href="/login" class="underline decoration-2">
            Sign In
          </A>
        </p>
      </div>
    </div></Show>
  );
}
