import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2, FileAudio } from "lucide-react";
import { toast } from "sonner";
import { validateMediaFile, ACCEPTED_FILE_INPUT } from "@/lib/audioValidation";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface AudioFileUploadProps {
  value: string;
  onChange: (url: string) => void;
  fieldKey: string;
  placeholder?: string;
}

function uploadViaApi(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("access_token");
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve((JSON.parse(xhr.responseText) as { url: string }).url); }
        catch { reject(new Error("Upload failed: invalid server response")); }
      } else {
        try { reject(new Error((JSON.parse(xhr.responseText) as any).error || "Upload failed")); }
        catch { reject(new Error(`Upload failed (HTTP ${xhr.status})`)); }
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out — check your connection and try again")));
    xhr.timeout = 30 * 60 * 1000; // 30-minute hard limit — a full show recording can be large
    xhr.open("POST", `${API_BASE}/upload/media`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });
}

/** Same value/onChange/fieldKey shape as SiteImageUpload, for audio (recordings, jingles, etc). */
export function AudioFileUpload({ value, onChange, fieldKey, placeholder }: AudioFileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    const validated = await validateMediaFile(file);
    if (!validated.valid) {
      toast.error(validated.error);
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadViaApi(file, setProgress);
      onChange(url);
      toast.success("Audio uploaded");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {value && !uploading && (
        <div className="flex items-center gap-2 rounded border border-border bg-muted p-2 text-xs">
          <FileAudio className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="truncate flex-1">{value}</span>
        </div>
      )}
      {uploading && (
        <div className="flex items-center gap-2 rounded border border-border bg-muted p-2 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
          <span>Uploading… {progress}%</span>
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || "https://…"}
          className="text-xs h-8 flex-1"
          disabled={uploading}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="shrink-0"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          <span className="ml-1.5">{uploading ? "Uploading…" : "Upload"}</span>
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={uploading}
            onClick={() => onChange("")}
            className="shrink-0 px-2"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" accept={ACCEPTED_FILE_INPUT} className="hidden" onChange={handleFile} data-field={fieldKey} />
    </div>
  );
}
