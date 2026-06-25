import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Trash2, Eye, User } from "lucide-react";
import { AdminSearchBar } from "@/components/admin/AdminSearchBar";
import { toast } from "sonner";

export default function AdminTranslators() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  const utils = trpc.useUtils();
  const { data: items = [], isLoading, error } = trpc.admin.listTranslators.useQuery({ search: search || undefined });
  const grantMutation = trpc.admin.grantTranslatorRole.useMutation({ onSuccess: () => utils.admin.listTranslators.invalidate() });
  const revokeMutation = trpc.admin.revokeTranslatorRole.useMutation({ onSuccess: () => utils.admin.listTranslators.invalidate() });

  const openNew = () => { setEmail(""); setOpen(true); };

  const save = async () => {
    if (!email.trim()) { toast.error("Enter an email"); return; }
    try {
      await grantMutation.mutateAsync({ email: email.trim() });
      toast.success("Translator role granted");
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Failed to grant role");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove translator role from this user?")) return;
    await revokeMutation.mutateAsync({ userId: id });
    toast.success("Translator role removed");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Translators</h1>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Translator</Button>
      </div>
      <div className="mb-4">
        <AdminSearchBar value={search} onChange={setSearch} placeholder="Search translators..." className="max-w-sm" />
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Translators are existing user accounts granted the translator role. Assign them to specific books from the book's
        Formats dialog → Contributors section.
      </p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12"></TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Translated Books</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>}
            {!isLoading && error && <TableRow><TableCell colSpan={6} className="text-center text-destructive py-8">Error: {error.message}</TableCell></TableRow>}
            {!isLoading && !error && items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No translators</TableCell></TableRow>}
            {items.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell><Avatar className="h-8 w-8"><AvatarImage src={t.avatar_url || undefined} /><AvatarFallback className="bg-secondary text-muted-foreground text-xs"><User className="h-3.5 w-3.5" /></AvatarFallback></Avatar></TableCell>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-sm">{t.email}</TableCell>
                <TableCell className="text-sm">{t.phone || "—"}</TableCell>
                <TableCell>{t.booksCount}</TableCell>
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/translator/${t.id}`)}><Eye className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Translator</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>User Email</Label>
              <Input type="email" placeholder="user@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <p className="text-[11px] text-muted-foreground mt-1">The user must already have a BoiAro account. This grants them the translator role.</p>
            </div>
            <Button className="w-full" onClick={save} disabled={grantMutation.isPending}>{grantMutation.isPending ? "Saving..." : "Grant Translator Role"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
