import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Painel de Variável — Portal Concursos",
  description: "Apuração mensal de variável — ClickUp + Zabbix",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
