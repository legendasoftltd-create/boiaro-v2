import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Sparkles, Trash2, RefreshCw, Mic, BarChart3, Database, Zap,
  AlertTriangle, CheckCircle, XCircle, Play, Pause, Square,
  ChevronLeft, ChevronRight, BookOpen, Search, Volume2, Music, Plus,
  Save, Download, Settings, Upload, Loader2, Key, Eye, EyeOff, ShieldCheck, ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { getValidAccessToken } from "@/lib/authTokens";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

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
      audioRef.current.loop = true;
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

// Known ElevenLabs TTS models (shown in selector)
const KNOWN_MODELS = [
  { id: "eleven_v3",             name: "Eleven v3 (সর্বোচ্চ গুণমান)" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2 (Bengali-tested, default)" },
  { id: "eleven_turbo_v2_5",     name: "Turbo v2.5 (দ্রুত)" },
  { id: "eleven_flash_v2_5",     name: "Flash v2.5 (সবচেয়ে দ্রুত)" },
];

// ── API Key Setup Section ─────────────────────────────────────────────────────
function ApiKeySetup() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  const { data: keyStatus, refetch: refetchStatus } = trpc.tts.adminGetApiKeyStatus.useQuery();

  const saveMutation = trpc.tts.adminSaveApiKey.useMutation({
    onSuccess: () => {
      toast.success("API Key সংরক্ষিত হয়েছে");
      setApiKey("");
      refetchStatus();
    },
    onError: (e) => toast.error(e.message),
  });

  const clearMutation = trpc.tts.adminClearApiKey.useMutation({
    onSuccess: () => {
      toast.success("DB-stored API Key মুছে ফেলা হয়েছে");
      refetchStatus();
    },
    onError: (e) => toast.error(e.message),
  });

  const sourceLabel = keyStatus?.source === "db"
    ? "Database (Admin Panel)"
    : keyStatus?.source === "env"
    ? "Environment Variable"
    : null;

  return (
    <Card className={`border ${keyStatus?.configured ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Key className="h-4 w-4 text-amber-400" /> ElevenLabs API Key Setup
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-0.5">
          API Key এখানে সেট করলে environment variable-এর চেয়ে অগ্রাধিকার পাবে।
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Current status */}
        <div className="flex items-center gap-2 text-sm">
          {keyStatus?.configured
            ? <ShieldCheck className="h-4 w-4 text-green-400 shrink-0" />
            : <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />}
          <span className={keyStatus?.configured ? "text-green-400 font-medium" : "text-amber-400 font-medium"}>
            {keyStatus?.configured ? `API Key কনফিগার আছে` : "API Key কনফিগার করা হয়নি"}
          </span>
          {sourceLabel && (
            <Badge variant="outline" className="text-[10px] ml-1">{sourceLabel}</Badge>
          )}
          {keyStatus?.source === "db" && (
            <Button variant="ghost" size="sm" className="ml-auto text-xs h-7 text-destructive hover:text-destructive"
              onClick={() => clearMutation.mutate()} disabled={clearMutation.isPending}>
              {clearMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
              DB Key মুছুন
            </Button>
          )}
        </div>

        {/* Key input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={keyStatus?.configured ? "নতুন key দিলে replace হবে…" : "sk_… API key লিখুন"}
              className="h-9 text-sm font-mono pr-10"
            />
            <Button
              variant="ghost" size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
              onClick={() => setShowKey(v => !v)}
              type="button"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button
            size="sm" className="h-9 text-xs bg-amber-500 hover:bg-amber-600 text-black shrink-0"
            onClick={() => saveMutation.mutate({ apiKey })}
            disabled={!apiKey.trim() || saveMutation.isPending}
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            সংরক্ষণ করুন
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Key শুধুমাত্র server-side ব্যবহার হয় — frontend-এ কখনো পাঠানো হয় না।
          {keyStatus?.source === "env" && " Environment variable দিয়ে key সেট আছে; DB-তে save করলে সেটি override হবে।"}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Voice Management Section ─────────────────────────────────────────────────
function VoiceManagement() {
  const [fetchedVoices, setFetchedVoices] = useState<any[] | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<
    { id: string; name: string; label: string; lang: string; enabled: boolean; category?: string }[]
  >([]);
  const [ttsModel, setTtsModel] = useState("");
  const [fetchedModels, setFetchedModels] = useState<any[] | null>(null);
  const [testAudioUrls, setTestAudioUrls] = useState<Record<string, string>>({});
  const [testPlaying, setTestPlaying] = useState<string | null>(null);
  const testAudioRefs = useRef<Record<string, HTMLAudioElement>>({});

  const { data: currentConfig, refetch: refetchConfig } = trpc.tts.adminGetVoiceConfig.useQuery();
  useEffect(() => {
    if (currentConfig?.length && !voiceConfig.length) setVoiceConfig(currentConfig as any);
  }, [currentConfig]);

  const { data: modelData } = trpc.tts.adminGetTtsModel.useQuery();
  useEffect(() => { if (modelData?.model && !ttsModel) setTtsModel(modelData.model); }, [modelData]);

  const fetchElevenLabsVoices = trpc.tts.adminFetchElevenLabsVoices.useQuery(undefined, { enabled: false });
  const fetchElevenLabsModels = trpc.tts.adminFetchElevenLabsModels.useQuery(undefined, { enabled: false });

  const saveConfigMutation = trpc.tts.adminSaveVoiceConfig.useMutation({
    onSuccess: () => { toast.success("Voice config সংরক্ষিত হয়েছে"); refetchConfig(); },
    onError: (e) => toast.error(e.message),
  });

  const saveModelMutation = trpc.tts.adminSaveTtsModel.useMutation({
    onSuccess: () => toast.success(`TTS Model সেট করা হয়েছে: ${ttsModel}`),
    onError: (e) => toast.error(e.message),
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

  const handleFetchVoices = async () => {
    const result = await fetchElevenLabsVoices.refetch();
    if (result.data) { setFetchedVoices(result.data); toast.success(`${result.data.length}টি ভয়েস পাওয়া গেছে`); }
    else toast.error("ElevenLabs থেকে ভয়েস আনতে ব্যর্থ");
  };

  const handleFetchModels = async () => {
    const result = await fetchElevenLabsModels.refetch();
    if (result.data) { setFetchedModels(result.data.filter(m => m.can_do_text_to_speech)); toast.success(`${result.data.length}টি model পাওয়া গেছে`); }
    else toast.error("Models আনতে ব্যর্থ");
  };

  const addVoiceToConfig = (v: any) => {
    if (voiceConfig.find(c => c.id === v.voice_id)) { toast.info("এই ভয়েস ইতিমধ্যে যোগ করা আছে"); return; }
    setVoiceConfig(prev => [...prev, { id: v.voice_id, name: v.name, label: v.name, lang: "bn", enabled: true, category: v.category }]);
  };

  const updateVoice = (id: string, field: string, value: any) =>
    setVoiceConfig(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));

  const removeVoice = (id: string) => setVoiceConfig(prev => prev.filter(v => v.id !== id));

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4 text-amber-400" /> Voice & Model Management
        </CardTitle>
        <p className="text-xs text-muted-foreground pt-1">
          ElevenLabs API থেকে ভয়েস এনে সক্রিয় করুন এবং TTS model বেছে নিন।
        </p>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* ── TTS Model Selector ── */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5" /> TTS Generation Model
            </p>
            <Button variant="ghost" size="sm" className="text-xs h-7"
              onClick={handleFetchModels} disabled={fetchElevenLabsModels.isFetching}>
              <Download className={`h-3 w-3 mr-1 ${fetchElevenLabsModels.isFetching ? "animate-spin" : ""}`} />
              API থেকে আনুন
            </Button>
          </div>
          <div className="flex gap-2">
            <Select value={ttsModel} onValueChange={setTtsModel}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Model বেছে নিন…" />
              </SelectTrigger>
              <SelectContent>
                {(fetchedModels ?? KNOWN_MODELS).map(m => (
                  <SelectItem key={m.id ?? m.model_id} value={m.id ?? m.model_id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={ttsModel} onChange={e => setTtsModel(e.target.value)}
              placeholder="custom model id…" className="h-8 text-xs w-48 font-mono" />
            <Button size="sm" className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-black shrink-0"
              onClick={() => saveModelMutation.mutate({ model: ttsModel })}
              disabled={!ttsModel || saveModelMutation.isPending}>
              <Save className="h-3 w-3 mr-1" />
              {saveModelMutation.isPending ? "…" : "সেট করুন"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            বর্তমান: <code className="bg-muted px-1 rounded font-mono">{modelData?.model ?? "eleven_multilingual_v2"}</code>
            {" · "}SHA-256 cache model ID অন্তর্ভুক্ত করে — model পরিবর্তনে নতুন cache তৈরি হবে।
          </p>
        </div>

        {/* ── Voice Config ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground">সক্রিয় Voice Config</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-7"
                onClick={handleFetchVoices} disabled={fetchElevenLabsVoices.isFetching}>
                <Download className={`h-3 w-3 mr-1 ${fetchElevenLabsVoices.isFetching ? "animate-spin" : ""}`} />
                ElevenLabs থেকে আনুন
              </Button>
              <Button size="sm" className="text-xs h-7 bg-amber-500 hover:bg-amber-600 text-black"
                onClick={() => saveConfigMutation.mutate(voiceConfig)}
                disabled={saveConfigMutation.isPending}>
                <Save className="h-3 w-3 mr-1" />
                {saveConfigMutation.isPending ? "…" : "সংরক্ষণ করুন"}
              </Button>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Voice ID</TableHead>
                <TableHead className="text-xs">Name</TableHead>
                <TableHead className="text-xs w-36">বাংলা Label</TableHead>
                <TableHead className="text-xs w-16 text-center">Active</TableHead>
                <TableHead className="text-xs w-28 text-center">টেস্ট</TableHead>
                <TableHead className="text-xs w-14 text-center">মুছুন</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {voiceConfig.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">
                  ElevenLabs থেকে ভয়েস এনে যোগ করুন
                </TableCell></TableRow>
              ) : voiceConfig.map(v => (
                <TableRow key={v.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{v.id.slice(0, 12)}…</TableCell>
                  <TableCell className="text-xs font-medium">{v.name}</TableCell>
                  <TableCell>
                    <Input value={v.label} onChange={e => updateVoice(v.id, "label", e.target.value)}
                      className="h-7 text-xs" placeholder="বাংলা নাম" />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch checked={v.enabled} onCheckedChange={val => updateVoice(v.id, "enabled", val)} />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex gap-1 justify-center">
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        disabled={testVoiceMutation.isPending && testVoiceMutation.variables?.voiceId === v.id}
                        onClick={() => testVoiceMutation.mutate({ voiceId: v.id })}>
                        {testVoiceMutation.isPending && testVoiceMutation.variables?.voiceId === v.id
                          ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
                      </Button>
                      {testAudioUrls[v.id] && (
                        <Button size="sm" variant={testPlaying === v.id ? "default" : "outline"}
                          className="h-7 w-7 p-0"
                          onClick={() => testPlaying === v.id ? stopTestAudio() : playTestAudio(v.id, testAudioUrls[v.id])}>
                          {testPlaying === v.id ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeVoice(v.id)}>
                      <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Fetched voices from ElevenLabs */}
        {fetchedVoices && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              ElevenLabs-এ পাওয়া ভয়েস ({fetchedVoices.length}টি) — "+" দিয়ে config-এ যোগ করুন
            </p>
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs w-20">Labels</TableHead>
                    <TableHead className="text-xs w-14 text-center">যোগ করুন</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fetchedVoices.map(v => {
                    const inConfig = voiceConfig.some(c => c.id === v.voice_id);
                    return (
                      <TableRow key={v.voice_id} className={inConfig ? "opacity-40" : ""}>
                        <TableCell className="text-xs font-medium">{v.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground capitalize">{v.category ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[80px]">
                          {Object.values(v.labels ?? {}).slice(0, 2).join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={inConfig}
                            onClick={() => addVoiceToConfig(v)}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Ambient Sound Management Section ─────────────────────────────────────────
function AmbientManagement() {
  type Track = { id: string; name: string; label: string; emoji: string; url: string; enabled: boolean; prompt?: string };
  const [tracks, setTracks] = useState<Track[]>([]);
  const [newTrack, setNewTrack] = useState({ id: "", name: "", label: "", emoji: "🎵", url: "", prompt: "" });
  const [generateFor, setGenerateFor] = useState<string | null>(null);
  const [duration, setDuration] = useState(22);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null); // track id or "new"
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null); // which track/field gets the url

  const handleUploadClick = (targetId: string) => {
    uploadTargetRef.current = targetId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadTargetRef.current) return;
    const target = uploadTargetRef.current;
    setUploadingFor(target);
    try {
      const token = await getValidAccessToken();
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/v1/tts/ambient-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest" },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Upload failed");
      }
      const data = await res.json() as { url: string; storage: string };
      if (target === "new") {
        setNewTrack(p => ({ ...p, url: data.url }));
      } else {
        setTracks(prev => prev.map(t => t.id === target ? { ...t, url: data.url } : t));
      }
      toast.success(`Uploaded to ${data.storage === "s3" ? "S3" : "local (will sync to S3)"}`);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploadingFor(null);
    }
  };

  const { data: ambientConfig } = trpc.tts.adminGetAmbientTracks.useQuery();
  useEffect(() => {
    if (ambientConfig?.length && !tracks.length) setTracks(ambientConfig as any);
  }, [ambientConfig]);

  const saveMutation = trpc.tts.adminSaveAmbientTracks.useMutation({
    onSuccess: () => toast.success("Ambient track config সংরক্ষিত হয়েছে"),
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = trpc.tts.adminGenerateAmbientSound.useMutation({
    onSuccess: (d, vars) => {
      toast.success(`Sound generated via ${d.via}`);
      // Auto-fill the URL for this track
      setTracks(prev => prev.map(t => t.id === vars.trackId ? { ...t, url: d.url } : t));
      setGenerateFor(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTrack = (id: string, field: string, value: any) =>
    setTracks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));

  const removeTrack = (id: string) => setTracks(prev => prev.filter(t => t.id !== id));

  const addTrack = () => {
    if (!newTrack.id.trim() || !newTrack.name.trim()) { toast.error("ID এবং Name প্রয়োজন"); return; }
    if (tracks.find(t => t.id === newTrack.id)) { toast.error("এই ID ইতিমধ্যে আছে"); return; }
    setTracks(prev => [...prev, { ...newTrack, enabled: true }]);
    setNewTrack({ id: "", name: "", label: "", emoji: "🎵", url: "", prompt: "" });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" /> Ambient Sound Management
          </CardTitle>
          <Button size="sm" className="text-xs h-8 bg-primary hover:bg-primary/90"
            onClick={() => saveMutation.mutate(tracks)} disabled={saveMutation.isPending}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saveMutation.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground pt-1">
          লোকাল মেশিন থেকে আপলোড করুন, ElevenLabs দিয়ে generate করুন, অথবা সরাসরি MP3 URL দিন।
          URL খালি থাকলে built-in synthetic sound ব্যবহার হবে।
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hidden file input shared across all tracks */}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/mpeg,audio/mp3,audio/aac,audio/ogg,audio/wav,audio/flac,audio/x-m4a"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Track list */}
        <div className="space-y-3">
          {tracks.map(t => (
            <div key={t.id} className="border rounded-lg p-3 space-y-2 bg-card">
              {/* Row 1: identity + controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg w-8 text-center">{t.emoji}</span>
                <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-1.5">
                  <Input value={t.name} onChange={e => updateTrack(t.id, "name", e.target.value)}
                    className="h-7 text-xs" placeholder="Name" />
                  <Input value={t.label} onChange={e => updateTrack(t.id, "label", e.target.value)}
                    className="h-7 text-xs" placeholder="বাংলা label" />
                  <Input value={t.emoji} onChange={e => updateTrack(t.id, "emoji", e.target.value)}
                    className="h-7 text-xs" placeholder="Emoji" />
                  <div className="flex items-center gap-2">
                    <Switch checked={t.enabled} onCheckedChange={val => updateTrack(t.id, "enabled", val)} />
                    <span className="text-[10px] text-muted-foreground font-mono">{t.id}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {t.url && <AudioPlayer url={t.url} />}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeTrack(t.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </div>

              {/* Row 2: URL + upload + generate buttons */}
              <div className="flex gap-2">
                <Input value={t.url} onChange={e => updateTrack(t.id, "url", e.target.value)}
                  className="h-7 text-xs flex-1" placeholder="MP3 URL (খালি = synthetic fallback)" />
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                  disabled={uploadingFor === t.id}
                  onClick={() => handleUploadClick(t.id)}>
                  {uploadingFor === t.id
                    ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    : <Upload className="h-3 w-3 mr-1" />}
                  আপলোড
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                  onClick={() => setGenerateFor(generateFor === t.id ? null : t.id)}>
                  <Sparkles className="h-3 w-3 mr-1 text-amber-400" />
                  ElevenLabs
                </Button>
              </div>

              {/* Inline generate panel */}
              {generateFor === t.id && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> ElevenLabs Sound Effects দিয়ে Generate করুন
                  </p>
                  <Input
                    value={(t as any).prompt ?? ""}
                    onChange={e => updateTrack(t.id, "prompt", e.target.value)}
                    placeholder="Sound description prompt (English)…"
                    className="h-8 text-xs"
                  />
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">Duration: {duration}s</span>
                    <input type="range" min={5} max={22} step={1} value={duration}
                      onChange={e => setDuration(Number(e.target.value))}
                      className="flex-1 accent-amber-500" />
                    <Button size="sm"
                      className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-black shrink-0"
                      disabled={generateMutation.isPending || !(t as any).prompt}
                      onClick={() => generateMutation.mutate({
                        trackId: t.id,
                        prompt: (t as any).prompt ?? "",
                        durationSeconds: duration,
                      })}>
                      {generateMutation.isPending && generateMutation.variables?.trackId === t.id
                        ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Generating…</>
                        : <><Sparkles className="h-3 w-3 mr-1" />Generate</>}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60">
                    Max 22s · ElevenLabs Sound Effects API · Generated audio ওয়েবসাইটে loop করবে
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new track */}
        <div className="border rounded-lg p-3 space-y-2 bg-muted/10">
          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> নতুন ট্র্যাক যোগ করুন
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Input placeholder="ID (e.g. jazz)" value={newTrack.id}
              onChange={e => setNewTrack(p => ({ ...p, id: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Name" value={newTrack.name}
              onChange={e => setNewTrack(p => ({ ...p, name: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="বাংলা label" value={newTrack.label}
              onChange={e => setNewTrack(p => ({ ...p, label: e.target.value }))} className="h-7 text-xs" />
            <Input placeholder="Emoji 🎵" value={newTrack.emoji}
              onChange={e => setNewTrack(p => ({ ...p, emoji: e.target.value }))} className="h-7 text-xs" />
            <div className="flex gap-2 col-span-2 md:col-span-4">
              <Input placeholder="MP3 URL (ঐচ্ছিক)" value={newTrack.url}
                onChange={e => setNewTrack(p => ({ ...p, url: e.target.value }))}
                className="h-7 text-xs flex-1" />
              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                disabled={uploadingFor === "new"}
                onClick={() => handleUploadClick("new")}>
                {uploadingFor === "new"
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <Upload className="h-3 w-3 mr-1" />}
                আপলোড
              </Button>
            </div>
          </div>
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={addTrack}>
            <Plus className="h-3 w-3 mr-1" /> যোগ করুন
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/70">
          Built-in synthetic fallback শুধুমাত্র: <code className="bg-muted px-1 rounded">calm, romance, horror, suspense, adventure</code>
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminTtsManagement() {
  const [cacheOffset, setCacheOffset] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [filterVoice, setFilterVoice] = useState("all");

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

  const refetchAll = () => {
    refetchApi(); refetchStats(); refetchCache(); refetchBookStats();
  };

  // ── Filtered cache items ──
  const allItems = cacheData?.items ?? [];
  const voiceMap: Record<string, string> = Object.fromEntries(
    (stats?.voices ?? []).map(v => [v.id, v.name])
  );
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

      {/* ── API Key Setup ── */}
      <ApiKeySetup />

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
          { icon: Mic, label: "Active Voices", value: stats?.voices?.length ?? "—", sub: "Bengali-configured" },
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

      {/* ── Voice Management ── */}
      <VoiceManagement />

      {/* ── Ambient Sound Management ── */}
      <AmbientManagement />

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
                {(stats?.voices ?? []).map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
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
                      {item.voice_id ? (voiceMap[item.voice_id] ?? item.voice_id.slice(0, 6)) : "—"}
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
