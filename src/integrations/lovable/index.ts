type OAuthProvider = "google" | "facebook" | "apple"

type SignInOptions = {
  redirect_uri?: string
  extraParams?: Record<string, string>
}

type OAuthResponse = {
  provider: OAuthProvider
  accessToken: string
}

declare global {
  interface Window {
    FB?: {
      init: (params: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }) => void
      login: (
        callback: (response: { authResponse?: { accessToken: string }; status: string }) => void,
        options?: { scope?: string }
      ) => void
    }
    fbAsyncInit?: () => void
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: { access_token?: string; error?: string; error_description?: string }) => void
            error_callback?: (error: { type: string }) => void
          }) => {
            requestAccessToken: (options?: { prompt?: string }) => void
          }
        }
      }
    }
  }
}

let facebookScriptPromise: Promise<void> | null = null

function loadFacebookSDK(appId: string): Promise<void> {
  if (facebookScriptPromise) return facebookScriptPromise
  facebookScriptPromise = new Promise((resolve, reject) => {
    if (window.FB) {
      resolve()
      return
    }
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: "v19.0", xfbml: false, cookie: false })
      resolve()
    }
    const existing = document.getElementById("facebook-jssdk")
    if (existing) return
    const script = document.createElement("script")
    script.id = "facebook-jssdk"
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.defer = true
    script.onerror = () => reject(new Error("Failed to load Facebook SDK."))
    document.head.appendChild(script)
  })
  return facebookScriptPromise
}

async function signInWithFacebook(): Promise<OAuthResponse> {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined
  if (!appId) throw new Error("Facebook login is not configured. Missing VITE_FACEBOOK_APP_ID.")

  await loadFacebookSDK(appId)

  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error("Facebook SDK failed to initialize."))
      return
    }
    window.FB.login(
      (response) => {
        if (response.authResponse?.accessToken) {
          resolve({ provider: "facebook", accessToken: response.authResponse.accessToken })
        } else {
          reject(new Error("Facebook login was cancelled or denied."))
        }
      },
      { scope: "email,public_profile" }
    )
  })
}

let googleScriptPromise: Promise<void> | null = null

function loadGoogleScript() {
  if (googleScriptPromise) return googleScriptPromise
  googleScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]')
    if (existing) {
      existing.addEventListener("load", () => resolve())
      existing.addEventListener("error", () => reject(new Error("Failed to load Google OAuth script.")))
      return
    }

    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load Google OAuth script."))
    document.head.appendChild(script)
  })
  return googleScriptPromise
}

async function signInWithGoogle(): Promise<OAuthResponse> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) {
    throw new Error("Google login is not configured. Missing VITE_GOOGLE_CLIENT_ID.")
  }

  await loadGoogleScript()

  const oauth2 = window.google?.accounts?.oauth2
  if (!oauth2) {
    throw new Error("Google OAuth is unavailable in this browser.")
  }

  return await new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: "openid email profile",
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error))
          return
        }
        if (!response.access_token) {
          reject(new Error("Google did not return an access token."))
          return
        }
        resolve({ provider: "google", accessToken: response.access_token })
      },
      error_callback: (error) => reject(new Error(`Google popup error: ${error.type}`)),
    })

    client.requestAccessToken({ prompt: "select_account" })
  })
}

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: OAuthProvider, _opts?: SignInOptions) => {
      try {
        if (provider === "google") {
          const data = await signInWithGoogle()
          return { data, error: null }
        }
        if (provider === "facebook") {
          const data = await signInWithFacebook()
          return { data, error: null }
        }
        return { data: null, error: new Error("Apple login is not configured yet.") }
      } catch (error) {
        return { data: null, error: error instanceof Error ? error : new Error("OAuth login failed") }
      }
    },
  },
}
