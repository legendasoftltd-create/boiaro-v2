import { useContentFilter, type ContentType } from "@/contexts/ContentFilterContext"
import { useIsMobile } from "@/hooks/use-mobile"
import type { MasterBook } from "@/lib/types"

/** On mobile, use the global navbar filter. On desktop, use the local section toggle. */
export function useBookFilter(localFilter: ContentType) {
  const { globalFilter } = useContentFilter()
  const isMobile = useIsMobile()
  const activeFilter = isMobile ? globalFilter : localFilter
  return activeFilter
}

export function filterBooks(books: MasterBook[], filter: ContentType): MasterBook[] {
  if (filter === "all") return books
  return books.filter(book => {
    if (filter === "ebook") return book.formats.ebook?.available
    if (filter === "audiobook") return book.formats.audiobook?.available
    if (filter === "hardcopy") return book.formats.hardcopy?.available
    return true
  })
}
