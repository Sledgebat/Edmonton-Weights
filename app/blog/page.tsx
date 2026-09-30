import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/ComingSoon";

export const metadata: Metadata = { title: "Blog" };

export default function Page() {
  return (
    <ComingSoon title="Blog" phase={8}>
      Posts from you and your friends, with live stat embeds.
    </ComingSoon>
  );
}
