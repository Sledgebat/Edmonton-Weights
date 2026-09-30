import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Roster" };

export default function Page() {
  return (
    <ComingSoon title="Roster" phase={4}>
      Forwards, defence and goalies as cards with huge jersey numbers, each linking to a player page.
    </ComingSoon>
  );
}
