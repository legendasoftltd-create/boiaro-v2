import { usePresence } from "@/hooks/usePresence";

/** Silent component that keeps the presence heartbeat running */
export function PresenceTracker() {
  usePresence();
  return null;
}
