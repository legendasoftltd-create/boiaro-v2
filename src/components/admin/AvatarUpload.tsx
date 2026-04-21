import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, X, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resizeAndCropAvatar } from "@/lib/imageResize";

const ACCEPTED = ".jpg,.jpeg,.png,.webp";
const MAX_INPUT_SIZE = 5 * 1024 * 1024;

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

interface AvatarUploadProps {
  currentUrl: string;
  onUrlChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  label?: string;
}

export function AvatarUpload({
  currentUrl,
  onUrlChange,
  label = "Profile Photo",
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const displayUrl = localPreview || currentUrl || undefined;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPG, PNG, or WebP images are allowed");
      return;
    }
    if (file.size > MAX_INPUT_SIZE) {
      toast.error("Image must be under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const processed = await resizeAndCropAvatar(file);
      const previewUrl = URL.createObjectURL(processed);
      setLocalPreview(previewUrl);

      const formData = new FormData();
      formData.append("file", processed, "avatar.jpg");

      const token = localStorage.getItem("access_token");
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Upload failed: " + (err.error || res.statusText));
        setLocalPreview(null);
        return;
      }

      const { url } = await res.json();
      onUrlChange(url);
      setLocalPreview(null);
      URL.revokeObjectURL(previewUrl);
      toast.success("Photo uploaded (512×512)");
    } catch (err: any) {
      toast.error("Processing failed: " + (err.message || "Unknown error"));
      setLocalPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    if (localPreview) {
      URL.revokeObjectURL(localPreview);
      setLocalPreview(null);
    }
    onUrlChange("");
  };

  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-16 w-16 border-2 border-border">
            <AvatarImage src={displayUrl} className="object-cover" />
            <AvatarFallback className="bg-secondary text-muted-foreground">
              <User className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              {uploading ? "Uploading…" : (currentUrl || localPreview) ? "Change" : "Upload"}
            </Button>
            {(currentUrl || localPreview) && (
              <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={uploading}>
                <X className="h-3.5 w-3.5 mr-1" /> Remove
              </Button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">JPG, PNG, WebP · Auto-cropped to 512×512</p>
        </div>
      </div>
      <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden" onChange={handleUpload} />
      <div className="mt-2">
        <Input
          placeholder="Or paste image URL…"
          value={currentUrl}
          onChange={(e) => { setLocalPreview(null); onUrlChange(e.target.value); }}
          className="text-xs h-8"
        />
      </div>
    </div>
  );
}
