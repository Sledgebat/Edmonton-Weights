import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Milestones" };

export default function Page() {
  return (
    <ComingSoon title="Milestones" phase={6}>
      Progress toward career milestones for McDavid, Draisaitl and the rest of the core, with projected dates.
    </ComingSoon>
  );
}
