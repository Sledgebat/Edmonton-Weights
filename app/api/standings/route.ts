import { serve } from "@/lib/api";
import { nhl } from "@/lib/nhl";

export function GET() {
  return serve(() => nhl.standings());
}
