import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { requestOtp } from "../../src/auth/supabase";
import { t } from "../../src/i18n";
import { colors, spacing, touch, type_ } from "../../src/ui/theme";

/** Normalise Kenyan phone entry to E.164 (+2547…). */
export function normalizeKePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  if (/^\+254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `+254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return `+${digits}`;
  return null;
}

export default function PhoneEntry() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const normalized = normalizeKePhone(phone);
    if (!normalized) {
      setError(t("auth.phone.placeholder"));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await requestOtp(normalized);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.push({ pathname: "/(auth)/otp", params: { phone: normalized } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: "center" }}>
      <Text style={[type_.title, { color: colors.text }]}>{t("auth.phone.title")}</Text>
      <Text style={[type_.subtitle, { marginTop: spacing.sm }]}>{t("auth.phone.subtitle")}</Text>
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder={t("auth.phone.placeholder")}
        keyboardType="phone-pad"
        autoFocus
        style={{
          marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: spacing.md, fontSize: 18, minHeight: touch.minTarget,
        }}
      />
      {error ? <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy}
        style={{
          marginTop: spacing.lg, backgroundColor: colors.primary, borderRadius: 8,
          minHeight: touch.minTarget, alignItems: "center", justifyContent: "center",
        }}
      >
        {busy ? <ActivityIndicator color={colors.primaryText} /> : (
          <Text style={[type_.button, { color: colors.primaryText }]}>{t("auth.phone.cta")}</Text>
        )}
      </Pressable>
    </View>
  );
}
