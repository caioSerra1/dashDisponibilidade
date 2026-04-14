"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface UserData {
  coins: number;
  lifetime: number;
  avatarVersion: number;
}

interface UserDataContextValue extends UserData {
  refresh: () => Promise<void>;
  bumpAvatar: () => void;
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<UserData>({ coins: 0, lifetime: 0, avatarVersion: 0 });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const w = await fetch("/api/me/wallet", { cache: "no-store" }).then((r) => r.json());
      setData((d) => ({ ...d, coins: w.coins ?? 0, lifetime: w.lifetime ?? 0 }));
    } catch {
      // silencioso — UI não bloqueia
    }
  }, []);

  const bumpAvatar = useCallback(() => {
    setData((d) => ({ ...d, avatarVersion: d.avatarVersion + 1 }));
  }, []);

  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    refresh();
  }, [loaded, refresh]);

  const value = useMemo(
    () => ({ ...data, refresh, bumpAvatar }),
    [data, refresh, bumpAvatar],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    // Fallback silencioso quando consumido fora do provider (ex: SSR sem provider)
    return {
      coins: 0,
      lifetime: 0,
      avatarVersion: 0,
      refresh: async () => undefined,
      bumpAvatar: () => undefined,
    };
  }
  return ctx;
}
