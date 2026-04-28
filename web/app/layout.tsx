import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import AppShell from "@/components/layout/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IndustryPrime-Attendance",
  description: "IndustryPrime-Attendance — Premium enterprise HRIS",
  icons: {
    icon: "/industryprime-logo.png",
    apple: "/industryprime-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var saved = window.localStorage.getItem('theme');
                  if (saved !== 'light' && saved !== 'dark') {
                    saved =
                      window.matchMedia &&
                      window.matchMedia('(prefers-color-scheme: dark)').matches
                        ? 'dark'
                        : 'light';
                  }
                  document.documentElement.classList.toggle('dark', saved === 'dark');
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-full flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
