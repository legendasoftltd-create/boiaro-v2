import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Trash2, Star, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function AdminReviews() {
  const [reviews, setReviews] = useState<any[]>([]);

  const load = async () => {
    const { data } = await supabase.from("reviews").select("*, books(title)").order("created_at", { ascending: false });
    setReviews(data || []);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id: string) => {
    if (!confirm("Remove this review?")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Removed"); load();
  };

  const toggleStatus = async (r: any) => {
    const newStatus = (r.status || "approved") === "approved" ? "hidden" : "approved";
    const { error } = await supabase.from("reviews").update({ status: newStatus } as any).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    setReviews(prev => prev.map(x => x.id === r.id ? { ...x, status: newStatus } : x));
    toast.success(newStatus === "approved" ? "Review visible" : "Review hidden");
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-black">Reviews</h1>
          
        </div>
        <div className="flex gap-2 text-sm">
          <Badge variant="outline">{reviews.filter(r => (r.status || "approved") === "approved").length} Visible</Badge>
          <Badge variant="outline" className="text-muted-foreground">{reviews.filter(r => r.status === "hidden").length} Hidden</Badge>
        </div>
      </div>
      <div className="border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-white">Book</TableHead>
              <TableHead className="text-white">Rating</TableHead>
              <TableHead className="text-white">Comment</TableHead>
              <TableHead className="text-white">Status</TableHead>
              <TableHead className="text-white">Date</TableHead>
              <TableHead className="text-right text-white">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviews.map((r) => (
              <TableRow key={r.id} className={(r.status === "hidden") ? "opacity-50" : ""}>
                <TableCell className="font-medium">{r.books?.title || "—"}</TableCell>
                <TableCell><div className="flex items-center gap-1"><Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />{r.rating}</div></TableCell>
                <TableCell className="max-w-xs truncate">{r.comment || "—"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch checked={(r.status || "approved") === "approved"} onCheckedChange={() => toggleStatus(r)} />
                    <span className="text-xs text-muted-foreground">
                      {(r.status || "approved") === "approved" ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {!reviews.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No reviews</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
