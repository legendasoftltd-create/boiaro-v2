import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles, Trash2, RefreshCw, Mic, BarChart3, Database, Zap,
  AlertTriangle, CheckCircle, XCircle, Play, Pause, Square,
  ChevronLeft, ChevronRight, BookOpen, Search, Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

const VOICE_MAP: Record<string, string> = {
  EXAVITQu4vr4xnSDxMaL: "Sarah",
  pFZP5JQG7iQjIQuC4Bku: "Lily",
  JBFqnCBsd6RMkjVDRZzb: "George",
};

const CACHE_PAGE = 20;

function fmtK(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("bn-BD", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtReset(unix: number | null) {
  if (!unix) return "—";
  return new Date(unix * 1000).toLocaleDateString("bn-BD", { day: "2-digit", month: "short" });
}

// ── Mini audio player ────────────────────────────────────────────────────────
function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onerror = () => { setPlaying(false); toast.error("Audio playback failed"); };
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => toast.error("Cannot play audio"));
      setPlaying(true);
    }
  };

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggle} title={playing ? "Pause" : "Play"}>
      {playing ? <Pause className="h-3 w-3 text-primary" /> : <Play className="h-3 w-3 text-muted-foreground" />}
    </Button>
  );
}

export default function AdminTtsManagement() {
  const [cacheOffset, setCacheOffset] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [filterVoice, setFilterVoice] = useState("all");
  const [testAudioUrls, setTestAudioUrls] = useState<Record<string, string>>({});
  const [testPlaying, setTestPlaying] = useState<string | null>(null);
  const testAudioRefs = useRef<Record<string, HTMLAudioElement>>({});

  // ── Queries ──
  const { data: apiStatus, refetch: refetchApi, isFetching: apiLoading } =
    trpc.tts.checkApiStatus.useQuery(undefined, { refetchInterval: 60_000 });

  const { data: stats, refetch: refetchStats } = trpc.tts.adminStats.useQuery();

  const { data: bookStats, refetch: refetchBookStats } = trpc.tts.adminBookStats.useQuery();

  const { data: cacheData, refetch: refetchCache } = trpc.tts.adminListCache.useQuery({
    limit: CACHE_PAGE, offset: cacheOffset,
  });

  // ── Mutations ──
  const clearOldMutation = trpc.tts.clearOldCache.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.deletedCount} টি পুরানো ক্যাশ মুছে ফেলা হয়েছে`);
      refetchStats(); refetchCache(); refetchBookStats();
    },
  });
  const clearAllMutation = trpc.tts.clearAllCache.useMutation({
    onSuccess: (d) => {
      toast.success(`সব ক্যাশ মুছে ফেলা হয়েছে (${d.deletedCount})`);
      refetchStats(); refetchCache(); refetchBookStats();
    },
  });
  const deleteSingleMutation = trpc.tts.adminDeleteCache.useMutation({
    onSuccess: () => { refetchStats(); refetchCache(); refetchBookStats(); },
  });
  const testVoiceMutation = trpc.tts.testVoice.useMutation({
    onSuccess: (d, vars) => {
      if (d.success && d.audioUrl) {
        setTestAudioUrls(prev => ({ ...prev, [vars.voiceId]: d.audioUrl! }));
        playTestAudio(vars.voiceId, d.audioUrl!);
      } else {
        toast.error(d.error === "QUOTA_EXCEEDED" ? "কোটা শেষ হয়ে গেছে" : (d.error ?? "Test failed"));
      }
    },
  });

  const playTestAudio = (voiceId: string, url: string) => {
    Object.values(testAudioRefs.current).forEach(a => { a.pause(); a.currentTime = 0; });
    setTestPlaying(voiceId);
    const audio = new Audio(url);
    testAudioRefs.current[voiceId] = audio;
    audio.onended = () => setTestPlaying(null);
    audio.play().catch(() => toast.error("Cannot play audio"));
  };

  const stopTestAudio = () => {
    Object.values(testAudioRefs.current).forEach(a => { a.pause(); a.currentTime = 0; });
    setTestPlaying(null);
  };

  const refetchAll = () => {
    refetchApi(); refetchStats(); refetchCache(); refetchBookStats();
  };

  // ── Filtered cache items ──
  const allItems = cacheData?.items ?? [];
  const filteredItems = allItems.filter(item => {
    const voiceMatch = filterVoice === "all" || item.voice_id === filterVoice;
    const textMatch = !searchText.trim() || item.source_text.toLowerCase().includes(searchText.toLowerCase());
    return voiceMatch && textMatch;
  });
  const totalItems = cacheData?.total ?? 0;
  const totalPages = Math.ceil(totalItems / CACHE_PAGE);
  const currentPage = Math.floor(cacheOffset / CACHE_PAGE) + 1;

  // ── Quota bar ──
  const quota = apiStatus?.quota;
  const quotaPct = quota ? Math.min(100, Math.round((quota.characterCount / quota.characterLimit) * 100)) : 0;
  const quotaRemaining = quota ? quota.characterLimit - quota.characterCount : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-500/15">
            <Sparkles className="h-6 w-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">TTS Management</h1>
            <p className="text-sm text-muted-foreground">ElevenLabs AI Voice — ক্যাশ ও পরিসংখ্যান</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refetchAll} disabled={apiLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${apiLoading ? "animate-spin" : ""}`} /> রিফ্রেশ
        </Button>
      </div>

      {/* ── API Status Card ── */}
      <Card className={`border ${apiStatus?.configured && !apiStatus?.error ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            {apiStatus?.configured && !apiStatus?.error
              ? <CheckCircle className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
              : <XCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />}
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">
                  {apiStatus?.configured && !apiStatus?.error
                    ? "ElevenLabs API সংযুক্ত"
                    : apiStatus?.error ?? "API Key কনফিগার করা হয়নি"}
                </p>
                {quota && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {quota.tier} · {quota.status}
                  </Badge>
                )}
              </div>

              {quota && (
                <>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>ব্যবহৃত: {fmtK(quota.characterCount)} / {fmtK(quota.characterLimit)} ক্যারেক্টার</span>
                      <span className="font-semibold text-foreground">{fmtK(quotaRemaining)} বাকি</span>
                    </div>
                    <Progress value={quotaPct} className="h-2" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    রিসেট: {fmtReset(quota.nextResetUnix)} · ব্যবহার: {quotaPct}%
                  </p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Database, label: "মোট ক্যাশড", value: stats?.totalCached ?? "—", sub: "অডিও সেগমেন্ট" },
          { icon: Zap, label: "আজকে জেনারেট", value: stats?.todayGenerated ?? "—", sub: "নতুন রিকোয়েস্ট" },
          { icon: BarChart3, label: "মোট ক্যারেক্টার", value: stats ? fmtK(stats.totalCharsProcessed) : "—", sub: "ElevenLabs-এ পাঠানো" },
          { icon: Mic, label: "Available Voices", value: stats?.voices?.length ?? 3, sub: "Bengali-friendly" },
        ].map((s, i) => (
          <Card key={i}>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <s.icon className="h-3.5 w-3.5" /> {s.label}
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Voice Cards with Test Button ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="h-4 w-4 text-amber-400" /> Bengali Voices (ElevenLabs)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(stats?.voices ?? []).map(v => (
              <div key={v.id} className="flex flex-col gap-3 p-3 rounded-xl border border-border/40 bg-muted/10">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Mic className="h-4 w-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 font-mono truncate">{v.id.slice(0, 12)}…</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 bg-green-500/10 text-green-400 border-green-500/30">
                    Active
                  </Badge>
                </div>

                {/* Test controls */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-7 text-xs"
                    disabled={testVoiceMutation.isPending}
                    onClick={() => testVoiceMutation.mutate({ voiceId: v.id })}
                  >
                    {testVoiceMutation.isPending && testVoiceMutation.variables?.voiceId === v.id
                      ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />জেনারেট হচ্ছে…</>
                      : <><Volume2 className="h-3 w-3 mr-1" />টেস্ট করুন</>}
                  </Button>

                  {testAudioUrls[v.id] && (
                    <Button
                      size="sm"
                      variant={testPlaying === v.id ? "default" : "outline"}
                      className="h-7 w-9 p-0"
                      onClick={() => testPlaying === v.id ? stopTestAudio() : playTestAudio(v.id, testAudioUrls[v.id])}
                    >
                      {testPlaying === v.id
                        ? <Square className="h-3 w-3" />
                        : <Play className="h-3 w-3" />}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Per-Book Stats ── */}
      {(bookStats?.length ?? 0) > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> বই অনুযায়ী TTS ক্যাশ (শীর্ষ ২০)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">বইয়ের নাম</TableHead>
                  <TableHead className="text-xs w-20 text-center">সেগমেন্ট</TableHead>
                  <TableHead className="text-xs w-24 text-center">ক্যারেক্টার</TableHead>
                  <TableHead className="text-xs w-28 text-center">অ্যাক্সেস</TableHead>
                  <TableHead className="text-xs w-24">সর্বশেষ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(bookStats ?? []).map(bs => (
                  <TableRow key={bs.bookId}>
                    <TableCell className="text-xs">
                      {bs.book
                        ? <a href={`/book/${bs.book.slug}`} target="_blank" rel="noreferrer"
                            className="hover:text-primary transition-colors font-medium">{bs.book.title}</a>
                        : <span className="text-muted-foreground font-mono">{bs.bookId.slice(0, 8)}…</span>}
                    </TableCell>
                    <TableCell className="text-xs text-center font-semibold">{bs.count}</TableCell>
                    <TableCell className="text-xs text-center text-muted-foreground">{fmtK(bs.totalChars)}</TableCell>
                    <TableCell className="text-xs text-center">
                      {bs.book?.premium_voice_enabled
                        ? <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/30 capitalize">
                            {bs.book.voice_access_type ?? "paid"}
                          </Badge>
                        : <span className="text-muted-foreground text-[10px]">disabled</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(bs.latest)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Cache Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-4 w-4" /> অডিও ক্যাশ ({totalItems})
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7"
                onClick={() => clearOldMutation.mutate({ daysOld: 30 })}
                disabled={clearOldMutation.isPending}>
                <Trash2 className="h-3 w-3 mr-1" /> ৩০দিনের পুরানো মুছুন
              </Button>
              <Button variant="destructive" size="sm" className="text-xs h-7"
                onClick={() => { if (confirm("সব TTS ক্যাশ মুছে ফেলবেন?")) clearAllMutation.mutate(); }}
                disabled={clearAllMutation.isPending}>
                <AlertTriangle className="h-3 w-3 mr-1" /> সব মুছুন
              </Button>
            </div>
          </div>

          {/* Filter row */}
          <div className="flex gap-2 pt-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="টেক্সট খুঁজুন…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={filterVoice} onValueChange={setFilterVoice}>
              <SelectTrigger className="h-8 text-xs w-32">
                <SelectValue placeholder="সব ভয়েস" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">সব ভয়েস</SelectItem>
                {Object.entries(VOICE_MAP).map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">টেক্সট (প্রিভিউ)</TableHead>
                <TableHead className="text-xs w-20">ভয়েস</TableHead>
                <TableHead className="text-xs w-16">Chars</TableHead>
                <TableHead className="text-xs w-28">তারিখ</TableHead>
                <TableHead className="text-xs w-20 text-center">অডিও</TableHead>
                <TableHead className="text-xs w-14 text-center">মুছুন</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-10 text-sm">
                    {searchText || filterVoice !== "all" ? "কোনো ফলাফল পাওয়া যায়নি" : "কোনো ক্যাশড অডিও নেই"}
                  </TableCell>
                </TableRow>
              ) : filteredItems.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs max-w-[200px]">
                    <p className="truncate text-foreground">{item.source_text.substring(0, 80)}…</p>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {item.voice_id ? (VOICE_MAP[item.voice_id] ?? item.voice_id.slice(0, 6)) : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(item as any).char_count ? fmtK((item as any).char_count) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{fmtDate(item.created_at)}</TableCell>
                  <TableCell className="text-center">
                    {item.audio_url
                      ? <AudioPlayer url={item.audio_url} />
                      : <span className="text-[10px] text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => deleteSingleMutation.mutate({ id: item.id })}>
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
              <p className="text-xs text-muted-foreground">
                পৃষ্ঠা {currentPage} / {totalPages} · মোট {totalItems}
              </p>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={cacheOffset === 0}
                  onClick={() => setCacheOffset(Math.max(0, cacheOffset - CACHE_PAGE))}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const page = Math.max(1, currentPage - 2) + i;
                  if (page > totalPages) return null;
                  return (
                    <Button key={page} variant={page === currentPage ? "default" : "outline"}
                      size="icon" className="h-7 w-7 text-xs"
                      onClick={() => setCacheOffset((page - 1) * CACHE_PAGE)}>
                      {page}
                    </Button>
                  );
                })}
                <Button variant="outline" size="icon" className="h-7 w-7"
                  disabled={cacheOffset + CACHE_PAGE >= totalItems}
                  onClick={() => setCacheOffset(cacheOffset + CACHE_PAGE)}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Cost guidance ── */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-semibold text-amber-400">ElevenLabs Cost Guidance</p>
              <p className="text-xs text-muted-foreground">
                Model: <code className="bg-muted px-1 rounded">eleven_multilingual_v2</code> ·
                Format: <code className="bg-muted px-1 rounded">mp3_44100_128</code>
              </p>
              <p className="text-xs text-muted-foreground">
                SHA-256 ক্যাশ হ্যাশ ব্যবহার করে — একই টেক্সট দুবার জেনারেট হয় না। ক্যাশ হিট রেট বাড়ালে খরচ কমে।
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
