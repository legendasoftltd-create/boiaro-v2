// OAuth stub — Google/Apple OAuth is handled server-side via /api/auth/google
// For now, redirect to the standard login page

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (_provider: "google" | "apple", _opts?: SignInOptions) => {
      // OAuth not yet wired — return a friendly error
      return { error: new Error("Google/Apple login is not yet configured. Please use email and password.") };
    },
  },
};
