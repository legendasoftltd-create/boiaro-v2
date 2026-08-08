import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/contexts/AuthContext";
import { getWebPushPermissionState, onForegroundPush, requestWebPushToken } from "@/lib/webPush";
import { isNativePushSupported, registerNativePush } from "@/lib/nativePush";

const LAST_TOKEN_KEY = "boiaro_push_token";

/**
 * Drives push notification registration for both the browser and the
 * Capacitor-wrapped native app, behind a single API. Call once near the
 * app root (mounted whenever a user is logged in).
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const registerMutation = trpc.notifications.registerPushToken.useMutation();
  const unregisterMutation = trpc.notifications.unregisterPushToken.useMutation();
  const cleanupRef = useRef<() => void>(() => {});

  const registerToken = useCallback(
    (token: string, platform: "android" | "ios" | "web") => {
      localStorage.setItem(LAST_TOKEN_KEY, token);
      registerMutation.mutate({ token, platform });
    },
    [registerMutation]
  );

  // Explicit opt-in: call from a user gesture (e.g. the push toggle in Notification Settings).
  const enablePush = useCallback(async (): Promise<boolean> => {
    if (isNativePushSupported()) {
      // Native registration happens automatically in the effect below once granted;
      // this just triggers the OS permission prompt path again if previously denied.
      return true;
    }
    const token = await requestWebPushToken();
    if (!token) return false;
    registerToken(token, "web");
    return true;
  }, [registerToken]);

  const disablePush = useCallback(() => {
    const token = localStorage.getItem(LAST_TOKEN_KEY);
    if (token) {
      unregisterMutation.mutate({ token });
      localStorage.removeItem(LAST_TOKEN_KEY);
    }
  }, [unregisterMutation]);

  useEffect(() => {
    if (!user) return;

    if (isNativePushSupported()) {
      cleanupRef.current = registerNativePush(
        (token, platform) => registerToken(token, platform),
        (link) => {
          utils.notifications.list.invalidate();
          if (link) navigate(link);
        }
      );
      return () => cleanupRef.current();
    }

    // Web: silently refresh the token if permission was already granted in a
    // previous session — never re-prompt automatically (that's an opt-in action).
    if (getWebPushPermissionState() === "granted") {
      requestWebPushToken().then((token) => {
        if (token) registerToken(token, "web");
      });
    }

    let unsubscribe = () => {};
    onForegroundPush((payload) => {
      utils.notifications.list.invalidate();
      utils.notifications.unreadCount.invalidate();
      if (payload.title) {
        // Lightweight native browser notification while the tab is focused.
        new Notification(payload.title, {
          body: payload.body,
          ...(payload.image ? { image: payload.image } : {}),
        });
      }
    }).then((unsub) => {
      unsubscribe = unsub;
    });

    return () => unsubscribe();
  }, [user, registerToken, navigate, utils]);

  return { enablePush, disablePush };
}
