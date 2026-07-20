import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GBP Monitor — Copenhagen Bali",
  description:
    "Zero-cost Google Business Profile competitor review monitor for Copenhagen Bali. Scrapes daily, surfaces new reviews, alerts on selector breakage. No AI/LLM in this phase.",
  keywords: [
    "GBP",
    "Google Business Profile",
    "Copenhagen Bali",
    "coffee shop",
    "review monitor",
    "Bali",
    "Seminyak",
    "Canggu",
    "Ubud",
  ],
  authors: [{ name: "Copenhagen Bali — GBP Monitor" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "GBP Monitor — Copenhagen Bali",
    description:
      "Zero-cost competitor review monitor for Copenhagen Bali's 6 branches.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <SonnerToaster position="bottom-right" richColors closeButton />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
