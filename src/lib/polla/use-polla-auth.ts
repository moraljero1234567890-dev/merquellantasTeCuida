"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { readPollaSession, writePollaSession, clearPollaSession, type PollaSession } from "./session";

export function usePollaAuth(options?: { redirect?: boolean }) {
  const router = useRouter();
  const [session, setSession] = useState<PollaSession | null>(null);
  const [checked, setChecked] = useState(false);
  const shouldRedirect = options?.redirect ?? true;

  useEffect(() => {
    const existing = readPollaSession();
    if (existing) {
      setSession(existing);
      setChecked(true);
      return;
    }

    fetch("/api/polla/auth/auto-login")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          writePollaSession(data.user);
          setSession({ ...data.user, ts: Date.now() });
        } else if (shouldRedirect) {
          router.replace("/polla/login");
        }
      })
      .catch(() => {
        if (shouldRedirect) router.replace("/polla/login");
      })
      .finally(() => setChecked(true));
  }, [router, shouldRedirect]);

  async function logout() {
    clearPollaSession();
    // Also end the dashboard (NextAuth) session so logging out of the polla
    // logs the user out of everything. No-op for polla-only users.
    try {
      await signOut({ redirect: false });
    } catch {
      /* no dashboard session to clear */
    }
    router.replace("/polla/login");
  }

  return { session, checked, logout };
}
