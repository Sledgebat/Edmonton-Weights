import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "On This Day" };

export default function Page() {
  return (
    <ComingSoon title="On This Day" phase={7}>
      Every Oilers game played on today&apos;s date since 1979-80.
    </ComingSoon>
  );
}
