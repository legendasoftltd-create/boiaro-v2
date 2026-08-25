import { useDeepLinks } from "@/hooks/useDeepLinks";

/** Silent component that routes tapped Universal/App Links to the right in-app screen */
export function DeepLinkHandler() {
  useDeepLinks();
  return null;
}
