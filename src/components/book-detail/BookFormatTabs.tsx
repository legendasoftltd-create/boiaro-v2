import { BookOpen, Headphones, Package } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import type { MasterBook } from "@/lib/types"
import type { AudioTrack } from "@/contexts/AudioPlayerContext"
import { EbookTab } from "./EbookTab"
import { AudiobookTab } from "./AudiobookTab"
import { HardcopyTab } from "./HardcopyTab"

interface Props {
  book: MasterBook
  audioTracks?: AudioTrack[]
}

export function BookFormatTabs({ book, audioTracks = [] }: Props) {
  const hasEbook = book.formats.ebook?.available
  const hasAudiobook = book.formats.audiobook?.available
  const hasHardcopy = book.formats.hardcopy?.available

  const defaultTab = hasEbook ? "ebook" : hasAudiobook ? "audiobook" : "hardcopy"

  return (
    <section className="container mx-auto px-4 lg:px-8 py-8 lg:py-12">
      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="w-full max-w-lg mx-auto grid grid-cols-3 bg-card border border-border h-14 rounded-xl p-1">
          <TabsTrigger
            value="ebook"
            disabled={!hasEbook}
            className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-medium transition-all disabled:opacity-30"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Read</span> eBook
          </TabsTrigger>
          <TabsTrigger
            value="audiobook"
            disabled={!hasAudiobook}
            className="gap-2 rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white font-medium transition-all disabled:opacity-30"
          >
            <Headphones className="w-4 h-4" />
            <span className="hidden sm:inline">Listen</span> Audio
          </TabsTrigger>
          <TabsTrigger
            value="hardcopy"
            disabled={!hasHardcopy}
            className="gap-2 rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white font-medium transition-all disabled:opacity-30"
          >
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">Buy</span> Hard Copy
          </TabsTrigger>
        </TabsList>

        {hasEbook && book.formats.ebook && (
          <TabsContent value="ebook" className="mt-8">
            <EbookTab book={book} ebook={book.formats.ebook} />
          </TabsContent>
        )}
        {hasAudiobook && book.formats.audiobook && (
          <TabsContent value="audiobook" className="mt-8">
            <AudiobookTab book={book} audiobook={book.formats.audiobook} audioTracks={audioTracks} />
          </TabsContent>
        )}
        {hasHardcopy && book.formats.hardcopy && (
          <TabsContent value="hardcopy" className="mt-8">
            <HardcopyTab book={book} hardcopy={book.formats.hardcopy} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  )
}