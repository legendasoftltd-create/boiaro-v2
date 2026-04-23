import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { LayoutGrid, Save } from "lucide-react";
import { toast } from "sonner";

interface Placement {
  id: string;
  placement_key: string;
  label: string;
  is_enabled: boolean;
  ad_type: string;
  frequency: string;
  device_visibility: string;
  display_priority: number;
  notes: string | null;
}

export default function AdminAdPlacements() {
  const utils = trpc.useUtils();
  const [editOpen, setEditOpen] = useState(false);
  const [current, setCurrent] = useState<Placement | null>(null);

  const { data: placements = [], isLoading: loading } = trpc.admin.listAdPlacements.useQuery();
  const updateMutation = trpc.admin.updateAdPlacement.useMutation({
    onSuccess: async () => {
      await utils.admin.listAdPlacements.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleEnabled = async (p: Placement) => {
    updateMutation.mutate({ id: p.id, is_enabled: !p.is_enabled });
  };

  const openEdit = (p: Placement) => { setCurrent({ ...p }); setEditOpen(true); };

  const save = async () => {
    if (!current) return;
    updateMutation.mutate({
      id: current.id,
      ad_type: current.ad_type,
      frequency: current.frequency,
      device_visibility: current.device_visibility,
      display_priority: current.display_priority,
      notes: current.notes,
    });
    toast.success("Placement updated");
    setEditOpen(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-bold flex items-center gap-2"><LayoutGrid className="w-6 h-6 text-primary" /> Ad Placements</h1>
        <p className="text-muted-foreground text-sm">Control where ads appear across the platform</p>
      </div>
      <Card className="border-border/30">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Placement</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Frequency</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : (placements as Placement[]).map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <p className="font-medium text-sm">{p.label}</p>
                  <p className="text-[11px] text-muted-foreground font-mono">{p.placement_key}</p>
                </TableCell>
                <TableCell><Badge variant="secondary">{p.ad_type}</Badge></TableCell>
                <TableCell className="text-sm">{p.frequency}</TableCell>
                <TableCell className="text-sm">{p.device_visibility}</TableCell>
                <TableCell className="text-sm">{p.display_priority}</TableCell>
                <TableCell><Switch checked={p.is_enabled} onCheckedChange={() => toggleEnabled(p)} /></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Placement: {current?.label}</DialogTitle></DialogHeader>
          {current && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Ad Type</Label>
                <Select value={current.ad_type} onValueChange={v => setCurrent({ ...current, ad_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="rewarded">Rewarded</SelectItem>
                    <SelectItem value="promotional">Promotional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={current.frequency} onValueChange={v => setCurrent({ ...current, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="always">Always</SelectItem>
                    <SelectItem value="once_per_session">Once per session</SelectItem>
                    <SelectItem value="once_per_day">Once per day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Device Visibility</Label>
                <Select value={current.device_visibility} onValueChange={v => setCurrent({ ...current, device_visibility: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Both</SelectItem>
                    <SelectItem value="mobile">Mobile</SelectItem>
                    <SelectItem value="web">Web</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Display Priority</Label>
                <Input type="number" value={current.display_priority} onChange={e => setCurrent({ ...current, display_priority: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={current.notes || ""} onChange={e => setCurrent({ ...current, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={updateMutation.isPending}><Save className="w-4 h-4 mr-1.5" />Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
