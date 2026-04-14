import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Search, Activity, Shield, LogIn, Eye, Download,
  BookOpen, Users, ShoppingCart, CreditCard, Bell, Settings, Wallet,
  Megaphone, HeadphonesIcon, Sparkles, LayoutDashboard, Calendar,
} from "lucide-react";
import SummaryCard from '@/components/admin/SummaryCard';


/* ── Types ───────────────────────────────── */

interface LogEntry {
  id: string;
  user_id: string;
  user_name: string | null;
  action: string;
  action_type: string | null;
  module: string | null;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  old_value: string | null;
  new_value: string | null;
  status: string;
  risk_level: string;
  ip_address: string | null;
  user_agent: string | null;
  actor_role: string | null;
  created_at: string;
}

/* ── Constants ───────────────────────────── */

const MODULE_ICONS: Record<string, any> = {
  books: BookOpen, users: Users, orders: ShoppingCart, payments: CreditCard,
  notifications: Bell, settings: Settings, wallet: Wallet, ads: Megaphone,
  support: HeadphonesIcon, recommendations: Sparkles, auth: LogIn,
  roles: Shield, content: LayoutDashboard, earnings: CreditCard,
  withdrawals: Wallet,
};

const ACTION_COLORS: Record<string, string> = {
  login: "bg-blue-500/20 text-blue-400",
  logout: "bg-slate-500/20 text-slate-400",
  create: "bg-emerald-500/20 text-emerald-400",
  update: "bg-amber-500/20 text-amber-400",
  delete: "bg-red-500/20 text-red-400",
  publish: "bg-teal-500/20 text-teal-400",
  unpublish: "bg-orange-500/20 text-orange-400",
  assign: "bg-violet-500/20 text-violet-400",
  approve: "bg-emerald-500/20 text-emerald-400",
  reject: "bg-red-500/20 text-red-400",
  reward: "bg-yellow-500/20 text-yellow-400",
  adjust: "bg-cyan-500/20 text-cyan-400",
  enable: "bg-green-500/20 text-green-400",
  disable: "bg-gray-500/20 text-gray-400",
  send: "bg-indigo-500/20 text-indigo-400",
  schedule: "bg-purple-500/20 text-purple-400",
  status_change: "bg-blue-500/20 text-blue-400",
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/20 text-amber-400",
  high: "bg-orange-500/20 text-orange-400",
  critical: "bg-red-500/20 text-red-400",
};

const RISK_LABELS: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", critical: "Critical",
};

const STATUS_COLORS: Record<string, string> = {
  success: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  warning: "bg-amber-500/20 text-amber-400",
  info: "bg-blue-500/20 text-blue-400",
};

const MODULES = [
  "auth", "books", "users", "orders", "payments", "wallet", "notifications",
  "settings", "ads", "support", "roles", "content", "recommendations",
  "earnings", "withdrawals",
];

const PAGE_SIZE = 50;

/* ── Component ───────────────────────────── */

export default function AdminActivityLogs() {
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [tab, setTab] = useState("all");
  const [detailLog, setDetailLog] = useState<LogEntry | null>(null);
  const [page, setPage] = useState(0);

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["admin-activity-logs", page, moduleFilter, riskFilter, statusFilter, search, tab, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from("admin_activity_logs")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false });

      if (moduleFilter !== "all") query = query.eq("module", moduleFilter);
      if (riskFilter !== "all") query = query.eq("risk_level", riskFilter);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (tab === "login") query = query.in("action_type", ["login", "logout"]);
      if (tab === "sensitive") query = query.in("risk_level", ["high", "critical"]);
      if (dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
      if (search) {
        query = query.or(`user_name.ilike.%${search}%,action.ilike.%${search}%,details.ilike.%${search}%,module.ilike.%${search}%`);
      }

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { logs: (data || []) as LogEntry[], total: count || 0 };
    },
  });

  const logs = pageData?.logs || [];
  const totalCount = pageData?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const exportCSV = () => {
    const headers = ["ID", "Admin", "Role", "Action", "Action Type", "Module", "Target", "Details", "Status", "Risk", "Date"];
    const rows = logs.map((l) => [
      l.id, l.user_name || "", l.actor_role || "", l.action, l.action_type || "",
      l.module || "", l.target_id || "", l.details || "", l.status, l.risk_level,
      new Date(l.created_at).toLocaleString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const ModuleIcon = ({ module }: { module: string | null }) => {
    const Icon = MODULE_ICONS[module || ""] || Activity;
    return <Icon className="w-4 h-4 text-primary shrink-0" />;
  };

  const clearFilters = () => {
    setSearch(""); setModuleFilter("all"); setRiskFilter("all"); setStatusFilter("all");
    setDateFrom(""); setDateTo(""); setPage(0);
  };

  const hasFilters = search || moduleFilter !== "all" || riskFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif text-black">Activity Logs & Audit Trail</h1>
        </div>
        <Button variant="outline" className="gap-2" onClick={exportCSV}>
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { label: "Total Logs", value: totalCount, icon: Activity, color: "text-primary" },
          { label: "Page", value: `${page + 1} / ${totalPages || 1}`, icon: LayoutDashboard, color: "text-blue-400" },
        ].map((s) => (
          // <Card key={s.label} className="border-border/30">
          //   <CardContent className="p-3 flex items-center gap-2.5">
          //     <div className="p-2 rounded-lg bg-secondary/60">
          //       <s.icon className={`w-4 h-4 ${s.color}`} />
          //     </div>
          //     <div>
          //       <p className="text-xl font-bold">{s.value}</p>
          //       <p className="text-[11px] text-muted-foreground">{s.label}</p>
          //     </div>
          //   </CardContent>
          // </Card>
          <SummaryCard
          key={s.label}
              icon={s.icon}
              title={s.label}
              value={s.value}
              color="#a13a20"
            />
        ))}
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v); setPage(0); }}>
        <TabsList className="flex items-center justify-center gap-5">
          <TabsTrigger value="all">All Logs</TabsTrigger>
          <TabsTrigger value="login">Login History</TabsTrigger>
          <TabsTrigger value="sensitive">Sensitive Actions</TabsTrigger>
        </TabsList>

        {["all", "login", "sensitive"].map((tabKey) => (
          <TabsContent key={tabKey} value={tabKey} className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white" />
                <Input placeholder="Search admin, action, module..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
              </div>
              <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {MODULES.map((m) => <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={riskFilter} onValueChange={(v) => { setRiskFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Risk" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                {/* <Calendar className="w-4 h-4 text-muted-foreground" /> */}
                <Input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} className="w-[150px] h-9" placeholder="From" />
                <span className="text-black text-sm">to</span>
                <Input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} className="w-[150px] h-9" placeholder="To" />
              </div>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-black">
                  Clear filters
                </Button>
              )}
            </div>

            {/* Table */}
            <Card className="border-border/30">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admin</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-black">Loading...</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-black">No logs found</TableCell></TableRow>
                  ) : (
                    logs.map((l) => (
                      <TableRow key={l.id} className={l.risk_level === "critical" ? "bg-red-500/5" : l.risk_level === "high" ? "bg-orange-500/5" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <ModuleIcon module={l.module} />
                            <div>
                              <p className="text-sm font-medium">{l.user_name || l.user_id.slice(0, 8)}</p>
                              {l.actor_role && <p className="text-[10px] text-black">{l.actor_role}</p>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[11px] ${ACTION_COLORS[l.action_type || l.action] || "bg-muted text-black"}`}>
                            {l.action_type || l.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-black capitalize">{l.module || "—"}</TableCell>
                        <TableCell className="text-sm max-w-[250px] truncate">{l.details || l.action}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${STATUS_COLORS[l.status] || "bg-muted text-black"}`}>
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${RISK_COLORS[l.risk_level] || RISK_COLORS.low}`}>
                            {RISK_LABELS[l.risk_level] || l.risk_level}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[11px] text-black whitespace-nowrap">
                          {new Date(l.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailLog(l)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
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
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <span className="text-sm text-black">Page {page + 1} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!detailLog} onOpenChange={() => setDetailLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" /> Log Details
            </DialogTitle>
          </DialogHeader>
          {detailLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-[11px]">Admin</p>
                  <p className="font-medium">{detailLog.user_name || detailLog.user_id.slice(0, 8)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Role</p>
                  <p className="font-medium">{detailLog.actor_role || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Action</p>
                  <Badge className={`text-[11px] ${ACTION_COLORS[detailLog.action_type || detailLog.action] || "bg-muted text-muted-foreground"}`}>
                    {detailLog.action_type || detailLog.action}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Module</p>
                  <p className="font-medium capitalize">{detailLog.module || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Status</p>
                  <Badge className={`text-[11px] ${STATUS_COLORS[detailLog.status]}`}>{detailLog.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Risk Level</p>
                  <Badge className={`text-[11px] ${RISK_COLORS[detailLog.risk_level]}`}>{RISK_LABELS[detailLog.risk_level] || detailLog.risk_level}</Badge>
                </div>
              </div>

              {detailLog.details && (
                <div>
                  <p className="text-muted-foreground text-[11px] mb-1">Details</p>
                  <p className="text-sm bg-secondary/40 p-3 rounded-lg">{detailLog.details}</p>
                </div>
              )}

              {detailLog.target_type && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground text-[11px]">Target Type</p>
                    <p className="font-medium">{detailLog.target_type}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[11px]">Target ID</p>
                    <p className="font-mono text-[12px]">{detailLog.target_id || "—"}</p>
                  </div>
                </div>
              )}

              {(detailLog.old_value || detailLog.new_value) && (
                <div className="space-y-2">
                  {detailLog.old_value && (
                    <div>
                      <p className="text-muted-foreground text-[11px] mb-1">Previous Value</p>
                      <pre className="text-[12px] bg-red-500/10 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">{detailLog.old_value}</pre>
                    </div>
                  )}
                  {detailLog.new_value && (
                    <div>
                      <p className="text-muted-foreground text-[11px] mb-1">New Value</p>
                      <pre className="text-[12px] bg-emerald-500/10 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">{detailLog.new_value}</pre>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm border-t border-border/30 pt-3">
                <div>
                  <p className="text-muted-foreground text-[11px]">Time</p>
                  <p className="text-[12px]">{new Date(detailLog.created_at).toLocaleString()}</p>
                </div>
                {detailLog.ip_address && (
                  <div>
                    <p className="text-muted-foreground text-[11px]">IP Address</p>
                    <p className="font-mono text-[12px]">{detailLog.ip_address}</p>
                  </div>
                )}
              </div>

              {detailLog.user_agent && (
                <div>
                  <p className="text-muted-foreground text-[11px] mb-1">Device</p>
                  <p className="text-[11px] text-muted-foreground truncate">{detailLog.user_agent}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
