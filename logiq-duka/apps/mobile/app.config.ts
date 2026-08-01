import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "LogiQ Duka",
  slug: "logiq-duka",
  scheme: "logiqduka",
  version: "0.1.0",
  orientation: "portrait",
  platforms: ["android", "ios"],
  android: {
    package: "ke.totalman.logiqduka",
    versionCode: 1,
  },
  plugins: ["expo-router", "expo-sqlite"],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    receiptBaseUrl: process.env.EXPO_PUBLIC_RECEIPT_BASE_URL ?? "",
  },
};

export default config;
