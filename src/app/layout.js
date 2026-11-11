// src/app/layout.js
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import AmbientBackground from "./components/AmbientBackground";
import AppShell from "./components/AppShell";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata = {
  title: "Atlas — Personal Workspace",
  description: "A personal workspace for coding activity, job tracking and AI-assisted career outreach.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col text-[var(--foreground)]">
        <AmbientBackground />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}