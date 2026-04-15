import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Upload, X, User, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resizeAndCropAvatar } from "@/lib/imageResize";

const ACCEPTED = ".jpg,.jpeg,.png,.webp";
const MAX_INPUT_SIZE = 5 * 1024 * 1024; // 5MB input limit (will be compressed)

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
  bucket = "avatars",
  folder = "creators",
  label = "Profile Photo",
}: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Show local preview first, then the saved URL
  const displayUrl = localPreview || currentUrl || undefined;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
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
      // Auto resize/crop to 512×512 JPEG
      const processed = await resizeAndCropAvatar(file);

      // Instant local preview from the processed file
      const previewUrl = URL.createObjectURL(processed);
      setLocalPreview(previewUrl);

      const path = `${folder}/${crypto.randomUUID()}.jpg`;

      const { error } = await supabase.storage.from(bucket).upload(path, processed, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

      if (error) {
        toast.error("Upload failed: " + error.message);
        setLocalPreview(null);
        return;
      }

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      onUrlChange(urlData.publicUrl);
      // Clear local preview once remote URL is set
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
      <Label className="mb-2 block text-black">{label}</Label>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar className="h-16 w-16 border-2 border-white">
            <AvatarImage src={displayUrl} className="object-cover" />
            <AvatarFallback className="bg-[#017B51] text-white">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
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
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={handleUpload}
      />
      {/* Fallback manual URL input */}
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
