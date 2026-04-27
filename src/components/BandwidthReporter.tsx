import { useBandwidthReporter } from "@/hooks/useBandwidthReporter";

/** Silent component that periodically flushes media metrics to the backend. */
export function BandwidthReporter() {
  useBandwidthReporter();
  return null;
}
