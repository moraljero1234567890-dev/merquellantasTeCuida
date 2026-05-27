"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ExternoGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session?.user?.rol !== "externo") return;
    if (!pathname.startsWith("/dashboard/fondo")) {
      router.replace("/dashboard/fondo");
    }
  }, [status, session, pathname, router]);

  if (status === "authenticated" && session?.user?.rol === "externo" && !pathname.startsWith("/dashboard/fondo")) {
    return null;
  }

  return <>{children}</>;
}
