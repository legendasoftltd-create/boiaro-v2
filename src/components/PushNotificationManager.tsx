import { usePushNotifications } from "@/hooks/usePushNotifications";

/** Silent component that drives push token registration (web + native) while logged in */
export function PushNotificationManager() {
  usePushNotifications();
  return null;
}
