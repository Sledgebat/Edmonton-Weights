import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Standings" };

export default function Page() {
  return (
    <ComingSoon title="Standings" phase={4}>
      Division, conference and wild card views, with the Oilers row highlighted and the cut line drawn.
    </ComingSoon>
  );
}
