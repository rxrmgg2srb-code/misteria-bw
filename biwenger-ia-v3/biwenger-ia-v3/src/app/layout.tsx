import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BiwengerIA – Análisis IA para Fantasy LaLiga",
  description: "Optimiza tu plantilla de Biwenger con inteligencia artificial. Análisis de once, fichajes recomendados y noticias de fantasy LaLiga.",
  keywords: "biwenger, fantasy laliga, comunio, análisis ia, once ideal, fichajes biwenger",
  openGraph: {
    title: "BiwengerIA – El mejor analizador de Biwenger",
    description: "IA que analiza tu plantilla y recomienda el once y fichajes óptimos para cada jornada.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
