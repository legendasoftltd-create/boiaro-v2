import { lazy, Suspense, useEffect, useMemo, memo } from "react"
import { useLocation } from "react-router-dom"
import { ContentFilterProvider } from "@/contexts/ContentFilterContext"
import { Navbar } from "@/components/Navbar"
import { Hero } from "@/components/Hero"
import { useHomepageSections } from "@/hooks/useHomepageSections"
import { Footer } from "@/components/Footer"
import { SectionSkeleton } from "@/components/SectionSkeleton"
import { HeroBannerStrip } from "@/components/HeroBannerStrip"
import { AdBannerBlock } from "@/components/AdBannerBlock"
import { ErrorBoundary } from "@/components/ErrorBoundary"

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
const TrendingAudiobooks = lazy(() => import("@/components/TrendingAudiobooks").then(m => ({ default: m.TrendingAudiobooks })))
const TopAudiobooks = lazy(() => import("@/components/TopAudiobooks").then(m => ({ default: m.TopAudiobooks })))
const Audiobooks = lazy(() => import("@/components/Audiobooks").then(m => ({ default: m.Audiobooks })))
const HardCopies = lazy(() => import("@/components/HardCopies").then(m => ({ default: m.HardCopies })))
const BestSellers = lazy(() => import("@/components/BestSellers").then(m => ({ default: m.BestSellers })))
const SpecialOffers = lazy(() => import("@/components/SpecialOffers").then(m => ({ default: m.SpecialOffers })))
const FreeBooks = lazy(() => import("@/components/FreeBooks").then(m => ({ default: m.FreeBooks })))
const Categories = lazy(() => import("@/components/Categories").then(m => ({ default: m.Categories })))
const Authors = lazy(() => import("@/components/Authors").then(m => ({ default: m.Authors })))
const Narrators = lazy(() => import("@/components/Narrators").then(m => ({ default: m.Narrators })))
const Translators = lazy(() => import("@/components/Translators").then(m => ({ default: m.Translators })))
const AppDownload = lazy(() => import("@/components/AppDownload").then(m => ({ default: m.AppDownload })))
const BlogSection = lazy(() => import("@/components/BlogSection").then(m => ({ default: m.BlogSection })))
const LiveRadioSection = lazy(() => import("@/components/LiveRadio").then(m => ({ default: m.LiveRadioSection })))
const CategorySections = lazy(() => import("@/components/CategorySections").then(m => ({ default: m.CategorySections })))
const HomeLeaderboard = lazy(() => import("@/components/HomeLeaderboard").then(m => ({ default: m.HomeLeaderboard })))

// Map section_key → React element factory
const SECTION_REGISTRY: Record<string, () => JSX.Element | null> = {
  continue_reading: () => <ContinueReading />,
  continue_listening: () => <ContinueListening />,
  recently_viewed: () => <RecentlyViewed />,
  recommended_for_you: () => <RecommendedForYou />,
  because_you_read: () => <BecauseYouRead />,
  featured_books: () => <FeaturedBooks />,
  trending_books: () => <TrendingBooks />,
  top_10_most_read: () => <Top10MostRead />,
  editors_pick: () => <EditorsPick />,
  popular_audiobooks: () => <PopularAudiobooks />,
  trending_audiobooks: () => <TrendingAudiobooks />,
  top_audiobooks: () => <TopAudiobooks />,
  audiobooks: () => <Audiobooks />,
  hard_copies: () => <HardCopies />,
  best_sellers: () => <BestSellers />,
  special_offers: () => <SpecialOffers />,
  free_books: () => <FreeBooks />,
  categories: () => <Categories />,
  authors: () => <Authors />,
  narrators: () => <Narrators />,
  translators: () => <Translators />,
  blog: () => <BlogSection />,
  live_radio: () => <LiveRadioSection />,
  app_download: () => <AppDownload />,
  category_sections: () => <CategorySections />,
  leaderboard: () => <HomeLeaderboard />,
}

// Fallback order when DB sections haven't loaded yet
const FALLBACK_KEYS = [
  "continue_reading", "continue_listening", "leaderboard", "recently_viewed",
  "recommended_for_you", "because_you_read", "featured_books",
  "trending_books", "top_10_most_read", "editors_pick",
  "popular_audiobooks", "trending_audiobooks", "top_audiobooks", "audiobooks",
  "hard_copies", "best_sellers", "special_offers", "free_books",
  "categories", "authors", "narrators", "translators", "live_radio", "blog", "app_download",
  "category_sections",
]
const REGISTRY_KEYS = new Set(Object.keys(SECTION_REGISTRY))

// Which ad placement key to show before each section
const SECTION_AD_PLACEMENT: Record<string, string> = {
  audiobooks:        "before_audiobook",
  popular_audiobooks:"before_audiobook",
  featured_books:    "before_reading",
  hard_copies:       "before_hardcopy",
}

// Which ad placement key to show right after each section
const SECTION_AD_AFTER: Record<string, string> = {
  recommended_for_you: "homepage_banner",
}

/** Each section gets its own Suspense boundary so one slow import doesn't block others */
const LazySection = memo(({ sectionKey }: { sectionKey: string }) => {
  const render = SECTION_REGISTRY[sectionKey]
  if (!render) return null
  const adBefore = SECTION_AD_PLACEMENT[sectionKey]
  const adAfter = SECTION_AD_AFTER[sectionKey]
  return (
    <>
      {adBefore && <AdBannerBlock placementKey={adBefore} />}
      <Suspense fallback={<SectionSkeleton />}>
        {render()}
      </Suspense>
      {adAfter && <AdBannerBlock placementKey={adAfter} />}
    </>
  )
})
LazySection.displayName = "LazySection"

const Index = () => {
  const { data: sections } = useHomepageSections()
  const { hash } = useLocation()

  const orderedKeys = useMemo(() => {
    if (!sections || sections.length === 0) return FALLBACK_KEYS
    const known = sections
      .map(s => s.section_key)
      .filter((k): k is string => REGISTRY_KEYS.has(k))
    return known.length > 0 ? known : FALLBACK_KEYS
  }, [sections])

  // "hero" has its own admin toggle (HOMEPAGE_SECTION_DEFAULTS) but Hero/
  // HeroBannerStrip aren't in SECTION_REGISTRY — they render below regardless
  // of orderedKeys, so disabling "hero" in admin previously had no effect at
  // all. useHomepageSections() only ever returns enabled rows, so "present in
  // sections" IS "enabled"; default true while sections hasn't loaded yet so
  // the hero doesn't flash away on first paint.
  const heroEnabled = !sections || sections.length === 0 ? true : sections.some(s => s.section_key === "hero")

  // Sections are lazy-loaded, so the target may not be in the DOM yet when
  // navigating here via a #section-key hash (e.g. the navbar radio icon) —
  // poll briefly instead of a single scrollIntoView attempt.
  useEffect(() => {
    const key = hash.replace(/^#/, "")
    if (!key) return
    let attempts = 0
    const id = window.setInterval(() => {
      attempts += 1
      const el = document.querySelector(`[data-section='${key}']`)
      if (el) {
        el.scrollIntoView({ behavior: "smooth" })
        window.clearInterval(id)
      } else if (attempts > 20) {
        window.clearInterval(id)
      }
    }, 150)
    return () => window.clearInterval(id)
  }, [hash])

  return (
    <ContentFilterProvider>
      <main className="min-h-screen bg-background">
        <Navbar />
        {heroEnabled && (
          <>
            <ErrorBoundary>
              <Hero />
            </ErrorBoundary>
            <ErrorBoundary>
              <HeroBannerStrip />
            </ErrorBoundary>
          </>
        )}
        <div className="transition-opacity duration-200 ease-out">
          {orderedKeys.map(key => (
            <ErrorBoundary key={key}>
              <LazySection sectionKey={key} />
            </ErrorBoundary>
          ))}
        </div>
        <Footer />
      </main>
    </ContentFilterProvider>
  )
}

export default Index
