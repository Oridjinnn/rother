import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { QueryProvider } from "@/components/providers/query-provider";
import { OnlineStatusProvider } from "@/hooks/use-online-status";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rother — Dashboard",
  description:
    "Competitor review monitoring dashboard. Track Google Business Profile reviews across branches and competitors automatically.",
  keywords: [
    "Rother",
    "review monitor",
    "competitor tracking",
    "Google Business Profile",
    "dashboard",
  ],
  authors: [{ name: "Rother" }],
  icons: {
    icon: "/rother-icon.svg",
  },
  openGraph: {
    title: "Rother — Dashboard",
    description:
      "Competitor review monitoring dashboard. Track reviews across branches and competitors automatically.",
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
            <OnlineStatusProvider>
              {children}
              <SonnerToaster position="bottom-right" richColors closeButton />
            </OnlineStatusProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
