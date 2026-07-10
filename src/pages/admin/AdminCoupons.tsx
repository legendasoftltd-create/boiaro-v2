import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { stripHtml } from "@/lib/stripHtml";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { toast } from "sonner";
import { Ticket, Plus, Pencil, Trash2, Search, X } from "lucide-react";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  applies_to: string;
  category_id: string | null;
  min_order_amount: number;
  usage_limit: number | null;
  per_user_limit: number;
  used_count: number;
  start_date: string;
  end_date: string | null;
  status: string;
  first_order_only: boolean;
  books: { book: { id: string; title: string } }[];
  category: { id: string; name: string } | null;
}

const emptyForm = {
  code: "", description: "", discount_type: "percentage", discount_value: 0,
  applies_to: "all", category_id: "" as string, book_ids: [] as string[],
  min_order_amount: 0, usage_limit: null as number | null,
  per_user_limit: 1, start_date: new Date().toISOString().slice(0, 10),
  end_date: "", status: "active", first_order_only: false,
};

const APPLIES_TO_LABELS: Record<string, string> = {
  all: "All Orders", hardcopy: "Hardcopy Only", ebook: "Ebook Only",
  audiobook: "Audiobook Only", subscription: "Subscription",
  coin_purchase: "Coin Purchase", books: "Selected Books", category: "By Category",
};

export default function AdminCoupons() {
  const utils = trpc.useUtils();
  const { dialog: confirmDialog, openConfirm } = useConfirmDialog();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDialog, setShowDialog] = useState(false);
  const [bookSearch, setBookSearch] = useState("");

  const { data: couponsRaw = [] } = trpc.admin.listCoupons.useQuery();
  const coupons = couponsRaw as Coupon[];
  const { data: allBooks = [] } = trpc.admin.listBookTitles.useQuery();
  const { data: allCategories = [] } = trpc.admin.listCategories.useQuery();

  const createMutation = trpc.admin.createCoupon.useMutation({
    onSuccess: async () => { toast.success("Created"); setShowDialog(false); await utils.admin.listCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.admin.updateCoupon.useMutation({
    onSuccess: async () => { toast.success("Updated"); setShowDialog(false); await utils.admin.listCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.admin.deleteCoupon.useMutation({
    onSuccess: async () => { toast.success("Deleted"); await utils.admin.listCoupons.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => coupons.filter(c =>
    !search || c.code.toLowerCase().includes(search.toLowerCase()) || (c.description || "").toLowerCase().includes(search.toLowerCase())
  ), [coupons, search]);

  const filteredBooks = useMemo(() =>
    (allBooks as { id: string; title: string }[]).filter(b =>
      !bookSearch || b.title.toLowerCase().includes(bookSearch.toLowerCase())
    ),
    [allBooks, bookSearch]
  );

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setBookSearch(""); setShowDialog(true); };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code, description: c.description || "", discount_type: c.discount_type,
      discount_value: c.discount_value, applies_to: c.applies_to,
      category_id: c.category_id || "",
      book_ids: c.books.map((b) => b.book.id),
      min_order_amount: c.min_order_amount, usage_limit: c.usage_limit,
      per_user_limit: c.per_user_limit,
      start_date: c.start_date ? new Date(c.start_date).toISOString().slice(0, 10) : "",
      end_date: c.end_date ? new Date(c.end_date).toISOString().slice(0, 10) : "",
      status: c.status, first_order_only: c.first_order_only || false,
    });
    setBookSearch("");
    setShowDialog(true);
  };

  const toggleBook = (bookId: string) => {
    setForm(f => ({
      ...f,
      book_ids: f.book_ids.includes(bookId)
        ? f.book_ids.filter(id => id !== bookId)
        : [...f.book_ids, bookId],
    }));
  };

  const save = async () => {
    if (!form.code) { toast.error("Code required"); return; }
    if (form.applies_to === "books" && form.book_ids.length === 0) {
      toast.error("Select at least one book"); return;
    }
    if (form.applies_to === "category" && !form.category_id) {
      toast.error("Select a category"); return;
    }
    const payload = {
      code: form.code.toUpperCase(), description: form.description || null,
      discount_type: form.discount_type, discount_value: Number(form.discount_value),
      applies_to: form.applies_to,
      category_id: form.applies_to === "category" ? form.category_id || null : null,
      book_ids: form.applies_to === "books" ? form.book_ids : [],
      min_order_amount: Number(form.min_order_amount),
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      per_user_limit: Number(form.per_user_limit),
      start_date: form.start_date || new Date().toISOString(),
      end_date: form.end_date || null,
      status: form.status, first_order_only: form.first_order_only,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const remove = (c: Coupon) => {
    openConfirm({
      message: `Are you sure you want to delete coupon "${c.code}"?`,
      onConfirm: () => deleteMutation.mutate({ id: c.id }),
    });
  };

  const toggleStatus = async (c: Coupon) => {
    updateMutation.mutate({
      id: c.id, code: c.code, description: c.description || null,
      discount_type: c.discount_type, discount_value: Number(c.discount_value),
      applies_to: c.applies_to,
      category_id: c.category_id || null,
      book_ids: c.books.map((b) => b.book.id),
      min_order_amount: Number(c.min_order_amount || 0),
      usage_limit: c.usage_limit, per_user_limit: c.per_user_limit ?? 1,
      start_date: c.start_date, end_date: c.end_date,
      status: c.status === "active" ? "inactive" : "active",
      first_order_only: c.first_order_only || false,
    });
  };

  const active = coupons.filter(c => c.status === "active").length;
  const totalUsed = coupons.reduce((s, c) => s + c.used_count, 0);

  const appliesLabel = (c: Coupon) => {
    if (c.applies_to === "books") {
      const count = c.books.length;
      return count === 1 ? c.books[0]?.book.title.slice(0, 20) + (c.books[0]?.book.title.length > 20 ? "…" : "") : `${count} Books`;
    }
    if (c.applies_to === "category") return c.category?.name || "Category";
    return APPLIES_TO_LABELS[c.applies_to] ?? c.applies_to;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Coupons</h1>
        <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Add Coupon</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total Coupons", value: coupons.length },
          { label: "Active", value: active },
          { label: "Total Uses", value: totalUsed },
          { label: "Inactive", value: coupons.length - active },
        ].map(c => (
          <Card key={c.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"><Ticket className="w-5 h-5 text-primary" /></div>
              <div><p className="text-2xl font-bold">{c.value}</p><p className="text-xs text-muted-foreground">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search coupons..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-secondary" />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Applies To</TableHead>
              <TableHead>Min Amount</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell>
                  <p className="font-mono font-bold text-sm">{c.code}</p>
                  {c.description && <p className="text-xs text-muted-foreground truncate max-w-[150px]">{stripHtml(c.description)}</p>}
                </TableCell>
                <TableCell className="font-semibold">
                  {c.discount_type === "percentage" ? `${c.discount_value}%` : `৳${c.discount_value}`}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs capitalize">{appliesLabel(c)}</Badge>
                </TableCell>
                <TableCell className="text-sm">{c.min_order_amount > 0 ? `৳${c.min_order_amount}` : "—"}</TableCell>
                <TableCell className="text-sm">{c.used_count}{c.usage_limit ? `/${c.usage_limit}` : ""}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(c.start_date).toLocaleDateString()}
                  {c.end_date && <> → {new Date(c.end_date).toLocaleDateString()}</>}
                </TableCell>
                <TableCell><Switch checked={c.status === "active"} onCheckedChange={() => toggleStatus(c)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(c)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No coupons</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Coupon" : "New Coupon"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Code *</Label>
                <Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="bg-secondary font-mono" />
              </div>
              <div>
                <Label className="text-sm mb-1.5">Applies To</Label>
                <Select value={form.applies_to} onValueChange={v => setForm(f => ({ ...f, applies_to: v, book_ids: [], category_id: "" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Orders</SelectItem>
                    <SelectItem value="hardcopy">Hardcopy Only</SelectItem>
                    <SelectItem value="ebook">Ebook Only</SelectItem>
                    <SelectItem value="audiobook">Audiobook Only</SelectItem>
                    <SelectItem value="subscription">Subscription</SelectItem>
                    <SelectItem value="coin_purchase">Coin Purchase</SelectItem>
                    <SelectItem value="books">Selected Books</SelectItem>
                    <SelectItem value="category">By Category</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category picker */}
            {form.applies_to === "category" && (
              <div>
                <Label className="text-sm mb-1.5">Category *</Label>
                <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(allCategories as { id: string; name: string }[]).map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Book multi-select */}
            {form.applies_to === "books" && (
              <div>
                <Label className="text-sm mb-1.5">Books * ({form.book_ids.length} selected)</Label>
                {form.book_ids.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {form.book_ids.map(id => {
                      const book = (allBooks as { id: string; title: string }[]).find(b => b.id === id);
                      return book ? (
                        <Badge key={id} variant="secondary" className="text-xs gap-1 pr-1">
                          {book.title.slice(0, 25)}{book.title.length > 25 ? "…" : ""}
                          <button onClick={() => toggleBook(id)} className="ml-0.5 hover:text-destructive"><X className="w-3 h-3" /></button>
                        </Badge>
                      ) : null;
                    })}
                  </div>
                )}
                <div className="relative mb-1.5">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input placeholder="Search books..." value={bookSearch} onChange={e => setBookSearch(e.target.value)} className="pl-8 h-8 text-xs bg-secondary" />
                </div>
                <div className="border rounded-md max-h-48 overflow-y-auto bg-secondary/50">
                  {filteredBooks.slice(0, 100).map(book => (
                    <label key={book.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-secondary cursor-pointer text-sm">
                      <Checkbox
                        checked={form.book_ids.includes(book.id)}
                        onCheckedChange={() => toggleBook(book.id)}
                      />
                      <span className="truncate">{book.title}</span>
                    </label>
                  ))}
                  {filteredBooks.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No books found</p>}
                </div>
              </div>
            )}

            <div><Label className="text-sm mb-1.5">Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-secondary" rows={2} /></div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm mb-1.5">Type</Label>
                <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed Amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-sm mb-1.5">Value</Label><Input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: Number(e.target.value) }))} className="bg-secondary" /></div>
              <div><Label className="text-sm mb-1.5">Min Amount (৳)</Label><Input type="number" value={form.min_order_amount} onChange={e => setForm(f => ({ ...f, min_order_amount: Number(e.target.value) }))} className="bg-secondary" /></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Usage Limit</Label><Input type="number" value={form.usage_limit ?? ""} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value ? Number(e.target.value) : null }))} placeholder="Unlimited" className="bg-secondary" /></div>
              <div><Label className="text-sm mb-1.5">Per User Limit</Label><Input type="number" value={form.per_user_limit} onChange={e => setForm(f => ({ ...f, per_user_limit: Number(e.target.value) }))} className="bg-secondary" /></div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm mb-1.5">Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="bg-secondary" /></div>
              <div><Label className="text-sm mb-1.5">End Date</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="bg-secondary" /></div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.first_order_only} onCheckedChange={v => setForm(f => ({ ...f, first_order_only: v }))} />
              <Label className="text-sm">First order only</Label>
            </div>

            <Button className="w-full" onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
