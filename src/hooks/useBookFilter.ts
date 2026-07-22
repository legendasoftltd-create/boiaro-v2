import type { ContentType } from "@/contexts/ContentFilterContext"

/** "all" has no server-side meaning — every book matches it, so pass undefined. */
export function toServerFormat(filter: ContentType): "ebook" | "audiobook" | "hardcopy" | undefined {
  return filter === "all" ? undefined : filter
}
