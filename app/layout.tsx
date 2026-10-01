import type { Metadata, Viewport } from "next";
// Self-hosted Google Fonts (via Fontsource) so builds and tests work offline.
import "@fontsource/saira-extra-condensed/latin-800.css";
import "@fontsource/oswald/latin-500.css";
import "@fontsource/oswald/latin-700.css";
import "@fontsource/barlow/latin-400.css";
import "@fontsource/barlow/latin-400-italic.css";
import "@fontsource/barlow/latin-500.css";
import "@fontsource/barlow/latin-600.css";
import "@fontsource/barlow/latin-700.css";
import "./globals.css";
import { BottomNav } from "@/components/ui/BottomNav";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { THEME_BOOT_SCRIPT } from "@/lib/theme/prefs";

export const metadata: Metadata = {
  title: { default: "EdmontonWeights", template: "%s · EdmontonWeights" },
  description: "Edmonton Oilers stats, basic and advanced, in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets data-mode before paint, so the server
    // markup intentionally differs from the hydrated attributes.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-dvh flex-col antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-button px-4 py-2 font-semibold text-button-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <BottomNav />
      </body>
    </html>
  );
}
