import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Search, AlertTriangle, AlertOctagon, ShieldAlert, Trash2, Eye, Activity,
} from "lucide-react";
import { toast } from "sonner";
import SummaryCard from '@/components/admin/SummaryCard';


const PAGE_SIZE = 30;

const LEVEL_STYLE: Record<string, { icon: typeof AlertTriangle; color: string }> = {
  warning: { icon: AlertTriangle, color: "bg-amber-500/20 text-amber-400" },
  error: { icon: AlertOctagon, color: "bg-red-500/20 text-red-400" },
  critical: { icon: ShieldAlert, color: "bg-red-600/30 text-red-300" },
};

interface SystemLog {
  id: string;
  level: string;
  module: string;
  message: string;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  fingerprint: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

export default function AdminSystemLogs() {
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [moduleFilter, setModuleFilter] = useState("");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<SystemLog | null>(null);

  const { data: pageData, isLoading, refetch } = useQuery({
    queryKey: ["system-logs", page, levelFilter, moduleFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("system_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (levelFilter !== "all") q = q.eq("level", levelFilter);
      if (moduleFilter) q = q.eq("module", moduleFilter);
      if (search) {
        q = q.or(`message.ilike.%${search}%,module.ilike.%${search}%`);
      }

      const from = page * PAGE_SIZE;
      q = q.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw error;
      return { logs: (data || []) as SystemLog[], total: count || 0 };
    },
  });

  const logs = pageData?.logs || [];
  const totalCount = pageData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleCleanup = async () => {
    try {
      const { data, error } = await supabase.rpc("cleanup_old_system_logs");
      if (error) throw error;
      toast.success(`Cleaned up ${data} old log entries`);
      refetch();
    } catch {
      toast.error("Cleanup failed");
    }
  };

  const criticalCount = logs.filter(l => l.level === "critical").length;
  const errorCount = logs.filter(l => l.level === "error").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2 text-black">
            System Logs
          </h1>

        </div>
        <Button variant="outline" size="sm" onClick={handleCleanup} className="gap-2">
          <Trash2 className="w-4 h-4" /> Cleanup 90d+
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: totalCount, color: "#017B51" },
          { label: "Errors (page)", value: errorCount, color: "#017B51" },
          { label: "Critical (page)", value: criticalCount, color: "#017B51" },
        ].map(s => (
        
          <SummaryCard
            key={s.label}
            icon={`s.icon`}
            title={s.label}
            value={s.value.toLocaleString()}
            color="#017B51"
          />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white" />
          <Input
            placeholder="Search message or module..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={levelFilter} onValueChange={v => { setLevelFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Module filter..."
          value={moduleFilter}
          onChange={e => { setModuleFilter(e.target.value); setPage(0); }}
          className="w-[150px]"
        />
      </div>

      {/* Table */}
      <Card className="border-border/30">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Level</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-black">Loading...</TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-black">
                  No system logs found — that's a good sign!
                </TableCell>
              </TableRow>
            ) : (
              logs.map(l => {
                const style = LEVEL_STYLE[l.level] || LEVEL_STYLE.error;
                const Icon = style.icon;
                return (
                  <TableRow
                    key={l.id}
                    className={l.level === "critical" ? "bg-red-500/5" : ""}
                  >
                    <TableCell>
                      <Badge className={`text-[11px] gap-1 ${style.color}`}>
                        <Icon className="w-3 h-3" />
                        {l.level}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm capitalize">{l.module}</TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">{l.message}</TableCell>
                    <TableCell>
                      {l.occurrence_count > 1 && (
                        <Badge variant="secondary" className="text-[10px]">
                          ×{l.occurrence_count}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-black whitespace-nowrap">
                      {new Date(l.last_seen_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetail(l)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-black">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-black">Page {page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif">Log Detail</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-black text-[11px]">Level</p>
                  <Badge className={LEVEL_STYLE[detail.level]?.color}>{detail.level}</Badge>
                </div>
                <div>
                  <p className="text-black text-[11px]">Module</p>
                  <p className="font-medium capitalize">{detail.module}</p>
                </div>
                <div>
                  <p className="text-black text-[11px]">Occurrences</p>
                  <p className="font-medium">{detail.occurrence_count}</p>
                </div>
                <div>
                  <p className="text-black text-[11px]">User ID</p>
                  <p className="font-mono text-xs">{detail.user_id || "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-black text-[11px]">Message</p>
                <p className="bg-muted/50 rounded p-2 text-xs">{detail.message}</p>
              </div>
              <div>
                <p className="text-black text-[11px]">First Seen</p>
                <p className="text-xs">{new Date(detail.first_seen_at).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-black text-[11px]">Last Seen</p>
                <p className="text-xs">{new Date(detail.last_seen_at).toLocaleString()}</p>
              </div>
              {detail.metadata && Object.keys(detail.metadata).length > 0 && (
                <div>
                  <p className="text-black text-[11px]">Metadata</p>
                  <pre className="bg-muted/50 rounded p-2 text-[11px] overflow-auto max-h-[200px]">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
