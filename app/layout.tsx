import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oil Country Hub",
  description: "Independent, data-first Edmonton Oilers fan site (prototype).",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
