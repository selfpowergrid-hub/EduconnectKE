import { Redirect } from "expo-router";
import { useSession } from "../src/auth/session";

export default function Index() {
  const { tenantId, currentUser } = useSession();
  if (!tenantId) return <Redirect href="/(auth)/phone-entry" />;
  if (!currentUser) return <Redirect href="/(auth)/pin-login" />;
  return <Redirect href="/(main)/home" />;
}
