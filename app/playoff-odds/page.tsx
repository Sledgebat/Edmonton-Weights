import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Playoff Odds" };

export default function Page() {
  return (
    <ComingSoon title="Playoff Odds" phase={6}>
      Odds to make the playoffs, win the division and finish in each seed, from a nightly simulation.
    </ComingSoon>
  );
}
