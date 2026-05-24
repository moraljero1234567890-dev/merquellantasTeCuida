import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Polla Mundialista Merque",
  description: "La polla del Mundial de Merquellantas. Pronostica los partidos, suma puntos y gana premios.",
};

export default function PollaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        // @ts-expect-error CSS custom properties
        "--background": "#ffffff",
        "--foreground": "#2e2e2e",
        "--foreground-soft": "rgba(46, 46, 46, 0.7)",
        "--foreground-muted": "rgba(46, 46, 46, 0.55)",
        "--brand": "#ff9900",
        "--brand-dark": "#cc7a00",
        "--brand-soft": "#fff4e0",
        "--surface": "#faf7f2",
        "--line": "rgba(46, 46, 46, 0.1)",
      }}
      className="min-h-screen"
    >
      {children}
    </div>
  );
}
