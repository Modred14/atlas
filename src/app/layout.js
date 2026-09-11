import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import AmbientBackground from "@/components/AmbientBackground";
import AppShell from "@/components/AppShell";

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
  description: "A personal productivity dashboard for coding activity, insights, and job tracking.",
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