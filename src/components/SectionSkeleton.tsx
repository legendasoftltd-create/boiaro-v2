import { Skeleton } from "@/components/ui/skeleton"

export function SectionSkeleton() {
  return (
    <div className="py-4 md:py-14 lg:py-20 min-h-[320px] md:min-h-[420px]">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center gap-3.5 mb-8">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 w-[155px] md:w-[190px]">
              <Skeleton className="aspect-[2/3] rounded-2xl mb-3" />
              <Skeleton className="h-4 w-3/4 mb-1.5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HeroSkeleton() {
  return (
    <div className="h-[85svh] min-h-[520px] max-h-[800px] bg-background pt-16 flex items-center">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-[1fr_auto] gap-16 items-center">
          <div className="space-y-4">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="h-5 w-full max-w-xl" />
            <Skeleton className="h-5 w-2/3 max-w-xl" />
            <div className="flex gap-3 pt-4">
              <Skeleton className="h-12 w-36 rounded-xl" />
              <Skeleton className="h-12 w-36 rounded-xl" />
            </div>
          </div>
          <div className="hidden lg:block">
            <Skeleton className="w-[280px] aspect-[2/3] rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  )
}
