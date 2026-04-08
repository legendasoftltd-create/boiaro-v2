import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

  const { data: voices, isLoading: voicesLoading } = useQuery({
    queryKey: ["voices-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voices")
        .select("id, name, language, gender")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const handleGenerate = async () => {
    if (!text.trim() || !voiceId) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const start = performance.now();

    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-tts", {
        body: { chapter_id: crypto.randomUUID(), voice_id: voiceId, text: text.trim(), language: "bn-BD" },
      });

      if (fnError) throw new Error(fnError.message || "Function call failed");
      if (data?.error) throw new Error(data.error);

      setResult({
        audioUrl: data.audio_url,
        cached: !!data.cached,
        mockMode: !!data.mock_mode,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (err: any) {
      const msg = err.message || "Something went wrong";
      if (msg.includes("non-2xx")) {
        setError("The TTS service is currently unavailable. Please check that the backend function is deployed and secrets are configured.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const selectedVoice = voices?.find((v) => v.id === voiceId);

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
                {voices?.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} ({v.language} · {v.gender})
                  </SelectItem>
                ))}
                {voices?.length === 0 && (
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
              {/* Status banner */}
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
                      {result.durationMs}ms
                      {result.cached && " · served from cache"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {result.cached && (
                    <Badge variant="outline" className="text-xs gap-1 border-primary/30">
                      <Database className="h-3 w-3" />
                      Cached
                    </Badge>
                  )}
                  <Badge
                    variant="secondary"
                    className={
                      result.mockMode
                        ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900 dark:text-amber-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-200"
                    }
                  >
                    {result.mockMode ? "Mock" : "Real"}
                  </Badge>
                </div>
              </div>

              {/* Mock mode hint */}
              {result.mockMode && (
                <p className="text-xs text-muted-foreground px-1">
                  ⚠ TTS API secrets are not configured. Set <code className="bg-muted px-1 rounded text-[11px]">CUSTOM_TTS_API_URL</code> and{" "}
                  <code className="bg-muted px-1 rounded text-[11px]">CUSTOM_TTS_API_KEY</code> to enable real generation.
                </p>
              )}

              {/* Audio player */}
              <audio ref={audioRef} controls src={result.audioUrl} className="w-full" autoPlay />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TtsDemo;
