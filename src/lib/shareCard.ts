const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/**
 * Fetches an auth-protected share-card image (badge unlock / weekly report)
 * and hands it to the OS share sheet when available (native apps, most
 * mobile browsers), falling back to opening it in a new tab for the user to
 * save/share manually on platforms without File-based Web Share support.
 */
export async function shareCardImage(path: string, filename: string, title: string, text?: string): Promise<void> {
  const token = localStorage.getItem("access_token");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to generate share image");
  const blob = await res.blob();
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title, text });
    return;
  }

  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
