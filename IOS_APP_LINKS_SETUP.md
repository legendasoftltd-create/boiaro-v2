# iOS Universal Links Setup

Instructions for whoever owns the iOS Xcode project (not in this repo) to make
`https://boiaro.com/...` links open the BoiAro app instead of Safari, and land
on the exact screen the link points to — the same behavior the Android app
now has (see `android/app/src/main/AndroidManifest.xml`'s App Links
intent-filter and `src/hooks/useDeepLinks.ts`).

The backend side of this is already done and live:
`https://boiaro.com/.well-known/apple-app-site-association` serves
```json
{ "applinks": { "apps": [], "details": [{ "appID": "RM38F8VNSN.com.boiaro.app", "paths": ["*"] }] } }
```
iOS will fetch and cache this automatically once the app declares the
association below — nothing else needs to change server-side.

---

## 1. Add the Associated Domains entitlement

In Xcode: target → **Signing & Capabilities** → **+ Capability** → **Associated
Domains**, then add:

```
applinks:boiaro.com
```

This is what makes iOS actually check `apple-app-site-association` at install
time and claim the domain — without it, the file being served correctly does
nothing (same relationship as `assetlinks.json` vs. the Android
intent-filter).

## 2. Handle the incoming URL

The app is a Capacitor webview pointed at `https://boiaro.com`
(`capacitor.config.ts`'s `server.url`), so a Universal Link doesn't need a
separate native screen — it just needs the webview to navigate to the link's
path. Add the standard Capacitor `application(_:continue:restorationHandler:)`
handling in `AppDelegate.swift`:

```swift
func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
    return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
}
```

This is exactly what `@capacitor/app`'s `appUrlOpen` event listener
(`src/hooks/useDeepLinks.ts`, already implemented and shared with Android)
expects to receive — no separate JS-side work needed once this native hook is
wired up. The listener parses the URL's path and calls React Router's
`navigate()`, so `https://boiaro.com/b/some-book` opens the app straight to
that book's page.

## 3. (Optional, complementary) Smart App Banner

Even without step 1/2 done, add this to the `<head>` in `index.html` for a
free native Safari "Open in App" banner with an automatic App Store fallback
if the app isn't installed — Apple's own mechanism, no JS required:

```html
<meta name="apple-itunes-app" content="app-id=YOUR_APP_STORE_ID">
```

---

## Verify

1. Install a TestFlight/dev build with the entitlement.
2. From Notes or Messages, send yourself `https://boiaro.com/b/{a-real-slug}`
   and tap it — it should open BoiAro directly to that book, not Safari.
3. Uninstall the app and tap the same link again — it should open the web
   page normally in Safari (graceful fallback, not a broken link).
4. If the App Store `apple-itunes-app` meta tag from step 3 is added, confirm
   the native "Open"/banner shows on any boiaro.com page in Safari when the
   app isn't installed, and that tapping it goes to the App Store listing.
