import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.svg,.ico";
const MAX_SIZE = 5 * 1024 * 1024;
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface SiteImageUploadProps {
  value: string;
  onChange: (url: string) => void;
  fieldKey: string;
}

export function SiteImageUpload({ value, onChange, fieldKey }: SiteImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayUrl = preview || value || undefined;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"];
    if (!allowed.includes(file.type)) {
      toast.error("Only JPG, PNG, WebP, SVG, or ICO files are allowed");
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error("File must be under 5 MB");
      return;
    }

    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file, `${fieldKey}-${Date.now()}${getExt(file.name)}`);

      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Upload failed: " + (err.error || res.statusText));
        setPreview(null);
        URL.revokeObjectURL(localUrl);
        return;
      }

      const { url } = await res.json();
      onChange(url);
      setPreview(null);
      URL.revokeObjectURL(localUrl);
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
      setPreview(null);
      URL.revokeObjectURL(localUrl);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {displayUrl && (
        <div className="relative inline-block rounded border border-border bg-muted p-1.5">
          <img
            src={displayUrl}
            alt={fieldKey}
            className="max-h-16 max-w-[200px] object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setPreview(null); onChange(e.target.value); }}
          placeholder="https://…"
          className="text-xs h-8 flex-1"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="shrink-0"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">{uploading ? "Uploading…" : "Upload"}</span>
        </Button>
        {value && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={uploading}
            onClick={() => { setPreview(null); onChange(""); }}
            className="shrink-0 px-2"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleFile} />
    </div>
  );
}

function getExt(filename: string) {
  const m = filename.match(/\.[^.]+$/);
  return m ? m[0] : "";
}
