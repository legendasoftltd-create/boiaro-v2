import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Upload, Loader2, BookOpen, Lock, FileText, Hash } from "lucide-react";
import { toast } from "sonner";

interface EbookChapterManagerProps {
  bookFormatId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Chapter {
  id: string;
  chapter_title: string;
  content: string | null;
  file_url: string | null;
  chapter_order: number;
  status: string;
  created_by: string | null;
  created_at: string;
}

export function EbookChapterManager({ bookFormatId, bookTitle, open, onOpenChange }: EbookChapterManagerProps) {
  const { user } = useAuth();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ title: "", content: "", file_url: "" });

  const loadChapters = async () => {
    const { data } = await supabase
      .from("ebook_chapters")
      .select("*")
      .eq("book_format_id", bookFormatId)
      .order("chapter_order");
    setChapters((data as Chapter[]) || []);
  };

  useEffect(() => {
    if (open && bookFormatId) loadChapters();
  }, [open, bookFormatId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File must be under 20MB");
      return;
    }
    setUploadingFile(true);
    const ext = file.name.split(".").pop();
    const path = `chapters/${bookFormatId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("ebooks").upload(path, file);
    if (error) {
      toast.error(error.message);
      setUploadingFile(false);
      return;
    }
    setForm(f => ({ ...f, file_url: path }));
    setUploadingFile(false);
    toast.success("Chapter file uploaded");
  };

  const saveChapter = async () => {
    if (!user || !form.title.trim()) {
      toast.error("Chapter title is required");
      return;
    }
    if (!form.content.trim() && !form.file_url) {
      toast.error("Please add content or upload a file");
      return;
    }
    setSaving(true);
    const nextOrder = chapters.length + 1;

    const { error } = await supabase.from("ebook_chapters").insert({
      book_format_id: bookFormatId,
      chapter_title: form.title.trim(),
      content: form.content.trim() || null,
      file_url: form.file_url || null,
      chapter_order: nextOrder,
      status: "draft",
      created_by: user.id,
    } as any);

    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    setAdding(false);
    setForm({ title: "", content: "", file_url: "" });
    toast.success(`Chapter ${nextOrder} added`);
    loadChapters();
  };

  const submitChapter = async (ch: Chapter) => {
    await supabase
      .from("ebook_chapters")
      .update({ status: "pending" } as any)
      .eq("id", ch.id);
    toast.success("Chapter submitted for review");
    loadChapters();
  };

  const deleteChapter = async (ch: Chapter) => {
    if (ch.status !== "draft") return;
    await supabase.from("ebook_chapters").delete().eq("id", ch.id);
    toast.success("Chapter deleted");
    loadChapters();
  };

  const isLocked = (status: string) => status !== "draft";

  const statusBadge = (status: string) => {
    const config: Record<string, { cls: string; label: string }> = {
      draft: { cls: "bg-secondary text-muted-foreground", label: "Draft" },
      pending: { cls: "bg-yellow-500/20 text-yellow-400", label: "Pending" },
      approved: { cls: "bg-emerald-500/20 text-emerald-400", label: "Approved" },
      rejected: { cls: "bg-destructive/20 text-destructive", label: "Rejected" },
    };
    const c = config[status] || config.draft;
    return <Badge variant="outline" className={`text-[9px] ${c.cls}`}>{c.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Chapters — {bookTitle}
          </DialogTitle>
        </DialogHeader>

        {chapters.length > 0 && (
          <div className="space-y-2">
            {chapters.map(ch => (
              <div key={ch.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/20 border border-border/20">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {ch.chapter_order}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{ch.chapter_title}</p>
                    {isLocked(ch.status) && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {statusBadge(ch.status)}
                    {ch.file_url && (
                      <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary">
                        <FileText className="h-2.5 w-2.5 mr-0.5" />File
                      </Badge>
                    )}
                    {ch.content && (
                      <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary">
                        <Hash className="h-2.5 w-2.5 mr-0.5" />Text
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {ch.status === "draft" && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitChapter(ch)}>
                        Submit
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteChapter(ch)}>
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {chapters.length === 0 && !adding && (
          <div className="text-center py-6 text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No chapters yet. Add your first chapter below.</p>
          </div>
        )}

        {adding ? (
          <Card className="border-border/30">
            <CardContent className="p-4 space-y-3">
              <div>
                <Label>Chapter Title *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder={`Chapter ${chapters.length + 1}`}
                />
              </div>
              <div>
                <Label>Content (text)</Label>
                <Textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={5}
                  placeholder="Write chapter content here..."
                />
              </div>
              <div>
                <Label>Or Upload File (PDF/EPUB)</Label>
                <input ref={fileRef} type="file" accept=".pdf,.epub,.txt,.docx" className="hidden" onChange={handleFileUpload} />
                <div className="flex items-center gap-3 mt-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadingFile}>
                    {uploadingFile ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />Uploading...</> : <><Upload className="h-3 w-3 mr-1.5" />Upload File</>}
                  </Button>
                  {form.file_url && <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 text-xs">✓ File uploaded</Badge>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveChapter} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Chapter"}
                </Button>
                <Button variant="outline" onClick={() => { setAdding(false); setForm({ title: "", content: "", file_url: "" }); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-2 p-4 border border-dashed border-border/40 rounded-lg text-center">
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-2" />Add Chapter
            </Button>
            <p className="text-[10px] text-muted-foreground mt-2">Add chapters one at a time. You can come back and add more later.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
