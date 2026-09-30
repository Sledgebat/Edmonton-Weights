import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Schedule" };

export default function Page() {
  return (
    <ComingSoon title="Schedule" phase={4}>
      The full season by month, with results, home and away, and spoiler-free mode.
    </ComingSoon>
  );
}
