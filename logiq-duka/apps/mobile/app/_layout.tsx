import { Stack } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { useSession } from "../src/auth/session";
import { openDb } from "../src/db/database";
import { startSyncLoop } from "../src/sync";

export default function RootLayout() {
  const { hydrate, hydrated, deviceId } = useSession();

  useEffect(() => {
    void openDb().then(hydrate);
  }, [hydrate]);

  useEffect(() => {
    if (!deviceId) return;
    return startSyncLoop(deviceId);
  }, [deviceId]);

  if (!hydrated) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
