import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { uuidv7 } from "@logiq/shared";
import { useSession } from "../../src/auth/session";
import { supabase } from "../../src/auth/supabase";
import { t } from "../../src/i18n";
import { colors, spacing, touch, type_ } from "../../src/ui/theme";

const BUSINESS_TYPES = ["duka", "butchery", "agrovet", "supa", "wines", "hardware", "cereals"] as const;

export default function BusinessSetup() {
  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof BUSINESS_TYPES)[number]>("duka");
  const [kraPin, setKraPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setTenant } = useSession();

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    // Tenant provisioning runs server-side (service role): creates the
    // tenant, owner user, main branch, this device, and stamps JWT claims.
    const { data, error: err } = await supabase.functions.invoke("tenant-provision", {
      body: { name: name.trim(), businessType: type, kraPin: kraPin.trim() || null, deviceId: uuidv7() },
    });
    setBusy(false);
    if (err || !data?.tenantId || !data?.deviceId) {
      setError(err?.message ?? "Setup failed — try again");
      return;
    }
    await setTenant(data.tenantId, data.deviceId);
    router.replace("/(auth)/pin-login");
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={[type_.title, { color: colors.text, marginTop: spacing.xl }]}>{t("auth.setup.title")}</Text>
      <Text style={[type_.subtitle, { marginTop: spacing.lg }]}>{t("auth.setup.name")}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={{
          marginTop: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: spacing.md, fontSize: 18, minHeight: touch.minTarget,
        }}
      />
      <Text style={[type_.subtitle, { marginTop: spacing.lg }]}>{t("auth.setup.type")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
        {BUSINESS_TYPES.map((bt) => (
          <Pressable
            key={bt}
            onPress={() => setType(bt)}
            style={{
              paddingHorizontal: spacing.md, minHeight: touch.minTarget, justifyContent: "center",
              borderRadius: 24, borderWidth: 1,
              borderColor: type === bt ? colors.primary : colors.border,
              backgroundColor: type === bt ? colors.primary : colors.bg,
            }}
          >
            <Text style={{ color: type === bt ? colors.primaryText : colors.text, fontSize: 16 }}>
              {t(`auth.setup.type.${bt}`)}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={[type_.subtitle, { marginTop: spacing.lg }]}>{t("auth.setup.kra")}</Text>
      <TextInput
        value={kraPin}
        onChangeText={setKraPin}
        autoCapitalize="characters"
        style={{
          marginTop: spacing.xs, borderWidth: 1, borderColor: colors.border, borderRadius: 8,
          padding: spacing.md, fontSize: 18, minHeight: touch.minTarget,
        }}
      />
      {error ? <Text style={{ color: colors.danger, marginTop: spacing.sm }}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy || !name.trim()}
        style={{
          marginTop: spacing.xl, backgroundColor: colors.primary, borderRadius: 8, opacity: busy || !name.trim() ? 0.5 : 1,
          minHeight: touch.minTarget, alignItems: "center", justifyContent: "center",
        }}
      >
        <Text style={[type_.button, { color: colors.primaryText }]}>{t("auth.setup.cta")}</Text>
      </Pressable>
    </ScrollView>
  );
}
