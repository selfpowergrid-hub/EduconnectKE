import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { requestOtp, verifyOtp } from "../../src/auth/supabase";
import { t } from "../../src/i18n";
import { colors, spacing, touch, type_ } from "../../src/ui/theme";

export default function Otp() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!phone || code.length < 4) return;
    setBusy(true);
    setError(null);
    const res = await verifyOtp(phone, code);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.replace("/(auth)/business-setup");
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: "center" }}>
      <Text style={[type_.title, { color: colors.text }]}>{t("auth.otp.title")}</Text>
      <Text style={[type_.subtitle, { marginTop: spacing.sm }]}>
        {t("auth.otp.subtitle", { phone: phone ?? "" })}
      </Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={{
          marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: spacing.md, fontSize: 28, letterSpacing: 12, textAlign: "center",
          minHeight: touch.minTarget,
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
          <Text style={[type_.button, { color: colors.primaryText }]}>{t("auth.otp.cta")}</Text>
        )}
      </Pressable>
      <Pressable onPress={() => phone && void requestOtp(phone)} style={{ marginTop: spacing.md, alignItems: "center" }}>
        <Text style={{ color: colors.primary, fontSize: 16 }}>{t("auth.otp.resend")}</Text>
      </Pressable>
    </View>
  );
}
