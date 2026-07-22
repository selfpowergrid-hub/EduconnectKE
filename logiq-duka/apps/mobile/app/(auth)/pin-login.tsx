import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSession } from "../../src/auth/session";
import { t } from "../../src/i18n";
import { colors, spacing, touch, type_ } from "../../src/ui/theme";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export default function PinLogin() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const { loginWithPin } = useSession();

  const press = async (k: string) => {
    if (k === "") return;
    setError(false);
    if (k === "⌫") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = pin + k;
    setPin(next);
    if (next.length >= 4) {
      const user = await loginWithPin(next);
      if (user) router.replace("/(main)/home");
      else if (next.length >= 6) {
        setError(true);
        setPin("");
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, justifyContent: "center" }}>
      <Text style={[type_.title, { color: colors.text, textAlign: "center" }]}>{t("auth.pin.title")}</Text>
      <Text style={[type_.subtitle, { textAlign: "center", marginTop: spacing.sm }]}>{t("auth.pin.subtitle")}</Text>
      <Text style={{ textAlign: "center", fontSize: 32, letterSpacing: 8, marginVertical: spacing.lg }}>
        {"●".repeat(pin.length).padEnd(6, "○")}
      </Text>
      {error ? (
        <Text style={{ color: colors.danger, textAlign: "center", marginBottom: spacing.md }}>
          {t("auth.pin.error")}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {KEYS.map((k, i) => (
          <Pressable
            key={i}
            onPress={() => void press(k)}
            style={{
              width: "33.33%", minHeight: touch.minTarget + 24, alignItems: "center", justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 28, color: colors.text }}>{k}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
