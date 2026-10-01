import Link from "next/link";
import { FOOTER_EXTRAS, NAV } from "@/lib/nav";
import { Rivets } from "./Rivets";

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-header text-header-fg">
      <div className="sleeve-stripes" aria-hidden />
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 md:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="display-hero text-3xl">
              Edmonton<span className="text-header-accent">Weights</span>
            </p>
            <Rivets className="mt-2 text-header-accent" />
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {[...NAV, ...FOOTER_EXTRAS].map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className="opacity-85 hover:underline hover:opacity-100">
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mt-8 border-t border-white/20 pt-4 text-sm">
          Independent fan site. Not affiliated with the Edmonton Oilers, Oilers Entertainment Group or the NHL.
        </p>
        <p className="mt-1 text-xs opacity-80">Data from the NHL&apos;s public web API. Prototype.</p>
      </div>
    </footer>
  );
}
