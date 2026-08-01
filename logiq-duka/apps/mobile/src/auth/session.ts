/**
 * Local session state: which tenant/device/staff-user this till is.
 * Staff PIN login is verified LOCALLY against synced users.pin_hash so
 * attendants can log in with zero network (PRD §7.5, §11.2).
 */
import { verifyPin } from "@logiq/shared";
import { create } from "zustand";
import { openDb, getMeta, setMeta } from "../db/database";

export interface StaffUser {
  id: string;
  fullName: string;
  role: "owner" | "manager" | "attendant" | "accountant";
}

interface SessionState {
  tenantId: string | null;
  deviceId: string | null;
  currentUser: StaffUser | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setTenant: (tenantId: string, deviceId: string) => Promise<void>;
  loginWithPin: (pin: string) => Promise<StaffUser | null>;
  logout: () => void;
}

export const useSession = create<SessionState>((set) => ({
  tenantId: null,
  deviceId: null,
  currentUser: null,
  hydrated: false,

  async hydrate() {
    const [tenantId, deviceId] = await Promise.all([getMeta("tenant_id"), getMeta("device_id")]);
    set({ tenantId, deviceId, hydrated: true });
  },

  async setTenant(tenantId, deviceId) {
    await setMeta("tenant_id", tenantId);
    await setMeta("device_id", deviceId);
    set({ tenantId, deviceId });
  },

  async loginWithPin(pin) {
    const db = await openDb();
    const users = await db.getAllAsync<{ id: string; full_name: string; role: string; pin_hash: string | null }>(
      "select id, full_name, role, pin_hash from users where active = 1",
    );
    for (const u of users) {
      if (u.pin_hash && (await verifyPin(pin, u.pin_hash))) {
        const user: StaffUser = { id: u.id, fullName: u.full_name, role: u.role as StaffUser["role"] };
        set({ currentUser: user });
        return user;
      }
    }
    return null;
  },

  logout() {
    set({ currentUser: null });
  },
}));
