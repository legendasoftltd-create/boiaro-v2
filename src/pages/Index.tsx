import { lazy, Suspense, useMemo, memo } from "react"
import { ContentFilterProvider } from "@/contexts/ContentFilterContext"
import { Navbar } from "@/components/Navbar"
import { Hero } from "@/components/Hero"
import { useBooks } from "@/hooks/useBooks"
import { usePopularAudiobooks } from "@/hooks/useRecommendations"
import { useHomepageSections } from "@/hooks/useHomepageSections"
import { Footer } from "@/components/Footer"
import { SectionSkeleton } from "@/components/SectionSkeleton"
import PremiumRadixSlider from "@/components/PremiumRadixSlider"

const ContinueReading = lazy(() => import("@/components/ContinueReading").then(m => ({ default: m.ContinueReading })))
const ContinueListening = lazy(() => import("@/components/ContinueListening").then(m => ({ default: m.ContinueListening })))
const RecentlyViewed = lazy(() => import("@/components/RecentlyViewed").then(m => ({ default: m.RecentlyViewed })))
const RecommendedForYou = lazy(() => import("@/components/RecommendedForYou").then(m => ({ default: m.RecommendedForYou })))
const BecauseYouRead = lazy(() => import("@/components/BecauseYouRead").then(m => ({ default: m.BecauseYouRead })))
const FeaturedBooks = lazy(() => import("@/components/FeaturedBooks").then(m => ({ default: m.FeaturedBooks })))
const TrendingBooks = lazy(() => import("@/components/TrendingBooks").then(m => ({ default: m.TrendingBooks })))
const Top10MostRead = lazy(() => import("@/components/Top10MostRead").then(m => ({ default: m.Top10MostRead })))
const EditorsPick = lazy(() => import("@/components/EditorsPick").then(m => ({ default: m.EditorsPick })))
const PopularAudiobooks = lazy(() => import("@/components/PopularAudiobooks").then(m => ({ default: m.PopularAudiobooks })))
const Audiobooks = lazy(() => import("@/components/Audiobooks").then(m => ({ default: m.Audiobooks })))
const HardCopies = lazy(() => import("@/components/HardCopies").then(m => ({ default: m.HardCopies })))
const FreeBooks = lazy(() => import("@/components/FreeBooks").then(m => ({ default: m.FreeBooks })))
const Categories = lazy(() => import("@/components/Categories").then(m => ({ default: m.Categories })))
const Authors = lazy(() => import("@/components/Authors").then(m => ({ default: m.Authors })))
const Narrators = lazy(() => import("@/components/Narrators").then(m => ({ default: m.Narrators })))
const AppDownload = lazy(() => import("@/components/AppDownload").then(m => ({ default: m.AppDownload })))
const BlogSection = lazy(() => import("@/components/BlogSection").then(m => ({ default: m.BlogSection })))
const LiveRadioSection = lazy(() => import("@/components/LiveRadio").then(m => ({ default: m.LiveRadioSection })))

// Map section_key → React element factory
const SECTION_REGISTRY: Record<string, (props: { books: any[]; popularAudiobooks: any[] }) => JSX.Element | null> = {
  continue_reading: () => <ContinueReading />,
  continue_listening: () => <ContinueListening />,
  recently_viewed: () => <RecentlyViewed />,
  recommended_for_you: () => <RecommendedForYou />,
  because_you_read: ({ books }) => <BecauseYouRead allBooks={books} />,
  featured_books: () => <FeaturedBooks />,
  trending_books: () => <TrendingBooks />,
  top_10_most_read: () => <Top10MostRead />,
  editors_pick: () => <EditorsPick />,
  popular_audiobooks: ({ popularAudiobooks }) => <PopularAudiobooks books={popularAudiobooks} />,
  audiobooks: () => <Audiobooks />,
  hard_copies: () => <HardCopies />,
  free_books: () => <FreeBooks />,
  categories: () => <Categories />,
  authors: () => <Authors />,
  narrators: () => <Narrators />,
  blog: () => <BlogSection />,
  live_radio: () => <LiveRadioSection />,
  app_download: () => <AppDownload />,
}

// Fallback order when DB sections haven't loaded yet
const FALLBACK_KEYS = [
  "continue_reading", "continue_listening", "recently_viewed",
  "recommended_for_you", "because_you_read", "featured_books",
  "trending_books", "top_10_most_read", "editors_pick",
  "popular_audiobooks", "audiobooks", "hard_copies", "free_books",
  "categories", "authors", "narrators", "live_radio", "blog", "app_download",
]

/** Each section gets its own Suspense boundary so one slow import doesn't block others */
const LazySection = memo(({ sectionKey, books, popularAudiobooks }: { sectionKey: string; books: any[]; popularAudiobooks: any[] }) => {
  const render = SECTION_REGISTRY[sectionKey]
  if (!render) return null
  return (
    <Suspense fallback={<SectionSkeleton />}>
      {render({ books, popularAudiobooks })}
    </Suspense>
  )
})
LazySection.displayName = "LazySection"

const Index = () => {
  const { books } = useBooks()
  const popularAudiobooks = usePopularAudiobooks(books)
  const { data: sections } = useHomepageSections()

  const orderedKeys = useMemo(() => {
    if (!sections || sections.length === 0) return FALLBACK_KEYS
    return sections.map(s => s.section_key)
  }, [sections])

  return (
    <ContentFilterProvider>
      <main className="min-h-screen bg-background">
        <Navbar />
        <Hero />
        <PremiumRadixSlider />
        <div className="transition-opacity duration-200 ease-out">
          {orderedKeys.map(key => (
            <LazySection key={key} sectionKey={key} books={books} popularAudiobooks={popularAudiobooks} />
          ))}
        </div>
        <Footer />
      </main>
    </ContentFilterProvider>
  )
}

export default Index
