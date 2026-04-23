import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Loader2, BookOpen, Lock, FileText, Hash } from "lucide-react";
import { toast } from "sonner";

interface EbookChapterManagerProps {
  bookFormatId: string;
  bookTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EbookChapterManager({ bookFormatId, bookTitle, open, onOpenChange }: EbookChapterManagerProps) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", content: "" });

  const { data: chapters = [], isLoading } = trpc.books.ebookChapters.useQuery(
    { bookFormatId },
    { enabled: open && !!bookFormatId }
  );

  const addMutation = trpc.books.addEbookChapter.useMutation({
    onSuccess: () => {
      utils.books.ebookChapters.invalidate({ bookFormatId });
      setAdding(false);
      setForm({ title: "", content: "" });
      toast.success(`Chapter ${chapters.length + 1} added`);
    },
    onError: (err) => toast.error(err.message),
  });

  const submitMutation = trpc.books.submitEbookChapter.useMutation({
    onSuccess: () => { utils.books.ebookChapters.invalidate({ bookFormatId }); toast.success("Chapter submitted for review"); },
  });

  const deleteMutation = trpc.books.deleteEbookChapter.useMutation({
    onSuccess: () => { utils.books.ebookChapters.invalidate({ bookFormatId }); toast.success("Chapter deleted"); },
  });

  const saveChapter = () => {
    if (!form.title.trim()) { toast.error("Chapter title is required"); return; }
    if (!form.content.trim()) { toast.error("Please add chapter content"); return; }
    addMutation.mutate({ bookFormatId, title: form.title.trim(), content: form.content.trim() });
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

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
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
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => submitMutation.mutate({ chapterId: ch.id })} disabled={submitMutation.isPending}>
                            Submit
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => deleteMutation.mutate({ chapterId: ch.id })} disabled={deleteMutation.isPending}>
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
                    <Label>Content *</Label>
                    <Textarea
                      value={form.content}
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      rows={5}
                      placeholder="Write chapter content here..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">File upload available in Phase 5 (storage provider pending)</p>
                  <div className="flex gap-2">
                    <Button onClick={saveChapter} disabled={addMutation.isPending} className="flex-1">
                      {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Chapter"}
                    </Button>
                    <Button variant="outline" onClick={() => { setAdding(false); setForm({ title: "", content: "" }); }}>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
