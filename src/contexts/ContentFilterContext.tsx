import { createContext, useContext, useState, useTransition, useCallback, type ReactNode } from "react"

export type ContentType = "all" | "ebook" | "audiobook" | "hardcopy"

interface ContentFilterContextType {
  globalFilter: ContentType
  setGlobalFilter: (value: ContentType) => void
  isPending: boolean
}

const ContentFilterContext = createContext<ContentFilterContextType>({
  globalFilter: "all",
  setGlobalFilter: () => {},
  isPending: false,
})

export function ContentFilterProvider({ children }: { children: ReactNode }) {
  const [globalFilter, setFilter] = useState<ContentType>("all")
  const [isPending, startTransition] = useTransition()

  const setGlobalFilter = useCallback((value: ContentType) => {
    startTransition(() => {
      setFilter(value)
    })
  }, [])

  return (
    <ContentFilterContext.Provider value={{ globalFilter, setGlobalFilter, isPending }}>
      {children}
    </ContentFilterContext.Provider>
  )
}

export function useContentFilter() {
  return useContext(ContentFilterContext)
}
