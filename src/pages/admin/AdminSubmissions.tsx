import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, XCircle, Eye, BookOpen, Image, Loader2, User2, RotateCcw, FileAudio, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function AdminSubmissions() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "draft" | "edit_requests">("pending");
  const [previewBook, setPreviewBook] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [reviewingRequest, setReviewingRequest] = useState<any>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const { data: submissions = [], isLoading } = trpc.admin.listSubmissions.useQuery(
    { status: filter },
    { enabled: filter !== "edit_requests" }
  );

  const { data: editRequests = [], isLoading: editRequestsLoading } = trpc.admin.listEditRequests.useQuery(
    undefined,
    { enabled: filter === "edit_requests" }
  );

  const { data: tracks = [] } = trpc.admin.getAudiobookTracksForFormat.useQuery(
    { bookFormatId: previewBook?.book_formats?.find((f: any) => f.format === "audiobook")?.id || "" },
    { enabled: !!previewBook?.book_formats?.find((f: any) => f.format === "audiobook") }
  );

  const updateStatusMutation = trpc.admin.updateSubmissionStatus.useMutation({
    onSuccess: (_data, vars) => {
      const msgs: Record<string, string> = { approved: "Content approved and is now live!", rejected: "Content rejected.", draft: "Sent back for correction." };
      toast.success(msgs[vars.status] || "Updated");
      utils.admin.listSubmissions.invalidate();
      setPreviewBook(null);
      setActionLoading(null);
    },
    onError: (e) => { toast.error(e.message); setActionLoading(null); },
  });

  const approveEditMutation = trpc.admin.approveEditRequest.useMutation({
    onSuccess: () => {
      toast.success("Edit request approved — changes applied to live content");
      utils.admin.listEditRequests.invalidate();
      setReviewingRequest(null);
      setAdminNotes("");
      setActionLoading(null);
    },
    onError: (e) => { toast.error(e.message); setActionLoading(null); },
  });

  const rejectEditMutation = trpc.admin.rejectEditRequest.useMutation({
    onSuccess: () => {
      toast.success("Edit request rejected");
      utils.admin.listEditRequests.invalidate();
      setReviewingRequest(null);
      setAdminNotes("");
      setActionLoading(null);
    },
    onError: (e) => { toast.error(e.message); setActionLoading(null); },
  });

  const handleAction = (bookId: string, action: "approved" | "rejected" | "draft") => {
    setActionLoading(bookId);
    updateStatusMutation.mutate({ bookId, status: action });
  };

  const formatBadge = (fmt: string) => {
    const config: Record<string, { label: string; cls: string }> = {
      ebook: { label: "eBook", cls: "bg-primary/20 text-primary border-primary/30" },
      audiobook: { label: "Audiobook", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
      hardcopy: { label: "Hardcopy", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    };
    const c = config[fmt] || { label: fmt, cls: "" };
    return <Badge key={fmt} variant="outline" className={`text-[10px] px-1.5 py-0 ${c.cls}`}>{c.label}</Badge>;
  };

  const roleBadge = (role: string) => {
    const colors: Record<string, string> = {
      writer: "bg-primary/20 text-primary", narrator: "bg-blue-500/20 text-blue-400", publisher: "bg-emerald-500/20 text-emerald-400",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${colors[role] || ""}`}>{role}</Badge>;
  };

  const renderChanges = (changes: any) => {
    if (!changes) return null;
    const entries: { key: string; value: any }[] = [];
    if (changes.book) {
      Object.entries(changes.book).forEach(([k, v]) => {
        if (k !== "submitted_by" && k !== "submission_status" && k !== "slug" && v !== null && v !== undefined) {
          entries.push({ key: `book.${k}`, value: v });
        }
      });
    }
    if (changes.format) {
      Object.entries(changes.format).forEach(([k, v]) => {
        if (k !== "format_id" && v !== null && v !== undefined) {
          entries.push({ key: `format.${k}`, value: v });
        }
      });
    }
    return (
      <div className="space-y-1.5">
        {entries.map(({ key, value }) => (
          <div key={key} className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground font-mono text-xs min-w-[120px]">{key}:</span>
            <span className="font-medium break-all">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BookOpen className="w-6 h-6 text-primary" /> Content Submissions
      </h1>

      <Tabs value={filter} onValueChange={v => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="edit_requests" className="gap-1">
            <Pencil className="w-3 h-3" />Edit Requests
          </TabsTrigger>
          <TabsTrigger value="draft">Drafts</TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>
      </Tabs>

      {filter === "edit_requests" ? (
        editRequestsLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (editRequests as any[]).length > 0 ? (
          <div className="space-y-2">
            {(editRequests as any[]).map((req: any) => (
              <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/20 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {req._book?.cover_url ? (
                    <img src={req._book.cover_url} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Image className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{req._book?.title || "Unknown Book"}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">by {req._submitter}</span>
                      <Badge variant="outline" className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
                        <Pencil className="w-2.5 h-2.5 mr-0.5" />Edit Request
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(req.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => { setReviewingRequest(req); setAdminNotes(""); }} className="h-8 gap-1.5 text-xs ml-2">
                  <Eye className="w-3.5 h-3.5" /> Review
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-border/30">
            <CardContent className="text-center py-10 text-muted-foreground">
              <Pencil className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No pending edit requests.</p>
            </CardContent>
          </Card>
        )
      ) : (
        isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (submissions as any[]).length > 0 ? (
          <div className="space-y-2">
            {(submissions as any[]).map((book: any) => (
              <div key={book.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/20 border border-border/20 hover:bg-secondary/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {book.cover_url ? (
                    <img src={book.cover_url} alt="" className="w-10 h-14 object-cover rounded flex-shrink-0" />
                  ) : (
                    <div className="w-10 h-14 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <Image className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{book.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">by {book._submitter}</span>
                      {(book.book_formats || []).map((f: any) => formatBadge(f.format))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(book.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPreviewBook(book)} className="h-8 gap-1.5 text-xs ml-2">
                  <Eye className="w-3.5 h-3.5" /> Review
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Card className="border-border/30">
            <CardContent className="text-center py-10 text-muted-foreground">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No {filter} submissions.</p>
            </CardContent>
          </Card>
        )
      )}

      <Dialog open={!!previewBook} onOpenChange={() => setPreviewBook(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Submission Review</DialogTitle></DialogHeader>
          {previewBook && (
            <div className="space-y-5">
              <div className="flex gap-4">
                {previewBook.cover_url ? (
                  <img src={previewBook.cover_url} alt="" className="w-24 h-36 object-cover rounded-lg" />
                ) : (
                  <div className="w-24 h-36 bg-muted rounded-lg flex items-center justify-center">
                    <Image className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold">{previewBook.title}</h2>
                  {previewBook.title_en && <p className="text-sm text-muted-foreground">{previewBook.title_en}</p>}
                  <p className="text-sm mt-1">Category: {previewBook.categories?.name_bn || previewBook.categories?.name || "None"}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <User2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm">{previewBook._submitter}</span>
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {(previewBook.book_contributors || []).map((c: any, i: number) => (
                      <span key={i}>{roleBadge(c.role)}</span>
                    ))}
                  </div>
                </div>
              </div>

              {previewBook.description && (
                <div className="p-3 rounded-lg bg-secondary/30">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{previewBook.description}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">Formats</h3>
                <div className="space-y-2">
                  {(previewBook.book_formats || []).map((f: any) => (
                    <div key={f.id} className="flex items-center gap-3 p-2.5 bg-secondary/30 rounded-lg flex-wrap">
                      {formatBadge(f.format)}
                      <span className="text-sm font-medium">৳{f.price}</span>
                      {f.file_url && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400">File uploaded</Badge>}
                      {f.stock_count !== null && <span className="text-xs text-muted-foreground">Stock: {f.stock_count}</span>}
                      {f.duration && <span className="text-xs text-muted-foreground">{f.duration}</span>}
                      {f.audio_quality && <span className="text-xs text-muted-foreground uppercase">{f.audio_quality}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {(tracks as any[]).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <FileAudio className="w-3.5 h-3.5" /> Episodes ({(tracks as any[]).length})
                  </h3>
                  <div className="space-y-1.5">
                    {(tracks as any[]).map((t: any) => (
                      <div key={t.id} className="flex items-center gap-3 p-2 bg-secondary/20 rounded-lg">
                        <div className="w-7 h-7 rounded bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {t.track_number}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{t.title}</p>
                          <p className="text-[10px] text-muted-foreground">{t.duration || "—"}</p>
                        </div>
                        {t.is_preview && <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400">Preview</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {filter === "pending" && (
                <div className="flex gap-2 pt-2 border-t border-border/30">
                  <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => handleAction(previewBook.id, "approved")}
                    disabled={!!actionLoading}>
                    {actionLoading === previewBook.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-2" />Approve</>}
                  </Button>
                  <Button variant="outline" onClick={() => handleAction(previewBook.id, "draft")} disabled={!!actionLoading} className="flex-1">
                    <RotateCcw className="h-4 w-4 mr-2" />Send Back
                  </Button>
                  <Button variant="outline" className="flex-1 text-destructive border-destructive/30"
                    onClick={() => handleAction(previewBook.id, "rejected")} disabled={!!actionLoading}>
                    <XCircle className="h-4 w-4 mr-2" />Reject
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewingRequest} onOpenChange={() => { setReviewingRequest(null); setAdminNotes(""); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Request Review
            </DialogTitle>
          </DialogHeader>
          {reviewingRequest && (
            <div className="space-y-5">
              <div className="flex gap-4">
                {reviewingRequest._book?.cover_url ? (
                  <img src={reviewingRequest._book.cover_url} alt="" className="w-20 h-28 object-cover rounded-lg" />
                ) : (
                  <div className="w-20 h-28 bg-muted rounded-lg flex items-center justify-center">
                    <Image className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-bold">{reviewingRequest._book?.title || "Unknown"}</h2>
                  <div className="flex items-center gap-1.5 mt-1">
                    <User2 className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm">{reviewingRequest._submitter}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Submitted: {new Date(reviewingRequest.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-secondary/30 border border-border/30">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Proposed Changes</h3>
                {renderChanges(reviewingRequest.proposed_changes)}
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Admin Notes (optional)</label>
                <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Add a note for the creator..." className="mt-1.5" rows={2} />
              </div>

              <div className="flex gap-2 pt-2 border-t border-border/30">
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { setActionLoading(reviewingRequest.id); approveEditMutation.mutate({ requestId: reviewingRequest.id, adminNotes: adminNotes || undefined }); }}
                  disabled={!!actionLoading}
                >
                  {actionLoading === reviewingRequest.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle className="h-4 w-4 mr-2" />Approve & Apply</>}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive border-destructive/30"
                  onClick={() => { setActionLoading(reviewingRequest.id); rejectEditMutation.mutate({ requestId: reviewingRequest.id }); }}
                  disabled={!!actionLoading}
                >
                  <XCircle className="h-4 w-4 mr-2" />Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
