import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export const supabase = createClient(
  extra.supabaseUrl ?? "http://localhost:54321",
  extra.supabaseAnonKey ?? "",
  { auth: { persistSession: true, autoRefreshToken: true } },
);

/** Phone OTP signup/login (PRD §16: phone number + OTP → business setup). */
export async function requestOtp(phone: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return error ? { error: error.message } : {};
}

export async function verifyOtp(phone: string, token: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
  return error ? { error: error.message } : {};
}

export async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
