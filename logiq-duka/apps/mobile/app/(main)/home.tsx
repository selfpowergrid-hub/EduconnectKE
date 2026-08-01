import { Text, View } from "react-native";
import { useSession } from "../../src/auth/session";
import { t } from "../../src/i18n";
import { useSyncHealth } from "../../src/sync";
import { colors, spacing, type_ } from "../../src/ui/theme";

/** Placeholder home — the Sell grid lands in M2 (PRD §30). */
export default function Home() {
  const { currentUser } = useSession();
  const { pending, lastError } = useSyncHealth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: "center" }}>
      <Text style={[type_.title, { color: colors.text }]}>{t("home.title")}</Text>
      <Text style={[type_.subtitle, { marginTop: spacing.sm }]}>{currentUser?.fullName}</Text>
      <View style={{ marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 8 }}>
        <Text style={{ color: lastError ? colors.warning : colors.muted, fontSize: 15 }}>
          {lastError
            ? t("sync.error")
            : pending > 0
              ? t("sync.pending", { count: pending })
              : t("sync.ok")}
        </Text>
      </View>
    </View>
  );
}
