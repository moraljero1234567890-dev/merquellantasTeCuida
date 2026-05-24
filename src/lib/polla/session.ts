"use client";

export type PollaSession = {
  cedula: string;
  email: string;
  name: string;
  attemptsAllowed: number;
  ts: number;
};

const KEY = "polla:session";

export function readPollaSession(): PollaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PollaSession>;
    if (typeof parsed.cedula !== "string" || typeof parsed.name !== "string") return null;
    return {
      cedula: parsed.cedula,
      email: parsed.email ?? "",
      name: parsed.name,
      attemptsAllowed: typeof parsed.attemptsAllowed === "number" ? parsed.attemptsAllowed : 10,
      ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
    };
  } catch {
    return null;
  }
}

export function writePollaSession(session: Omit<PollaSession, "ts">): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify({ ...session, ts: Date.now() }));
}

export function clearPollaSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
