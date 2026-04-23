import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Volume2, AlertCircle, CheckCircle2, Radio, Database } from "lucide-react";

type GenerationResult = {
  audioUrl: string;
  cached: boolean;
  mockMode: boolean;
  durationMs: number;
};

const TtsDemo = () => {
  const [text, setText] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const { data: voices = [], isLoading: voicesLoading } = trpc.books.voices.useQuery();

  const handleGenerate = async () => {
    if (!text.trim() || !voiceId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // TTS generation via external provider is Phase 5 — not yet available
      throw new Error("The TTS service is currently unavailable. TTS provider integration is pending (Phase 5).");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const selectedVoice = (voices as any[]).find((v: any) => v.id === voiceId);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-primary" />
            TTS Demo
          </CardTitle>
          <CardDescription>Test text-to-speech generation with your configured voices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Voice selector */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Voice</label>
            <Select value={voiceId} onValueChange={setVoiceId} disabled={voicesLoading}>
              <SelectTrigger>
                <SelectValue placeholder={voicesLoading ? "Loading voices…" : "Select a voice"} />
              </SelectTrigger>
              <SelectContent>
                {(voices as any[]).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} ({v.language})
                  </SelectItem>
                ))}
                {(voices as any[]).length === 0 && !voicesLoading && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No voices found. Add voices in the database.</div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Text input */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Text</label>
            <Textarea
              placeholder="Enter Bangla or English text to convert to speech…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground mt-1">{text.trim().length} characters</p>
          </div>

          {/* Generate button */}
          <Button onClick={handleGenerate} disabled={loading || !text.trim() || !voiceId} className="w-full">
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating audio{selectedVoice ? ` with ${selectedVoice.name}` : ""}…
              </span>
            ) : (
              "Generate Voice"
            )}
          </Button>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/20 rounded-lg p-3.5">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-destructive">Generation Failed</p>
                <p className="text-xs text-destructive/80">{error}</p>
              </div>
            </div>
          )}

          {/* Success result */}
          {result && (
            <div className="space-y-3">
              <div
                className={`flex items-center justify-between rounded-lg p-3 border ${
                  result.mockMode
                    ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800"
                    : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800"
                }`}
              >
                <div className="flex items-center gap-2">
                  {result.mockMode ? (
                    <Radio className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <div>
                    <p className={`text-sm font-medium ${result.mockMode ? "text-amber-800 dark:text-amber-300" : "text-emerald-800 dark:text-emerald-300"}`}>
                      {result.mockMode ? "Mock Mode — placeholder audio" : "Real Mode — generated by TTS API"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {result.durationMs}ms{result.cached && " · served from cache"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {result.cached && (
                    <Badge variant="outline" className="text-xs gap-1 border-primary/30">
                      <Database className="h-3 w-3" />Cached
                    </Badge>
                  )}
                  <Badge variant="secondary" className={result.mockMode ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200" : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200"}>
                    {result.mockMode ? "Mock" : "Real"}
                  </Badge>
                </div>
              </div>
              <audio ref={audioRef} controls src={result.audioUrl} className="w-full" autoPlay />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TtsDemo;
