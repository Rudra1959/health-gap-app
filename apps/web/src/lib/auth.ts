import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// This prevents the app from crashing if env vars are missing
if (!supabaseUrl || !supabaseKey) {
  console.error("CRITICAL: Supabase keys are missing in .env");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
