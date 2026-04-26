import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Ticket, AlertCircle, Clock, CheckCircle, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

const statusColors: Record<string, string> = {
  open: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  in_progress: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-blue-500/20 text-blue-400",
  high: "bg-orange-500/20 text-orange-400",
  urgent: "bg-red-500/20 text-red-400",
};

const statusIcons: Record<string, React.ReactNode> = {
  open: <AlertCircle className="h-4 w-4" />,
  in_progress: <Clock className="h-4 w-4" />,
  resolved: <CheckCircle className="h-4 w-4" />,
  closed: <XCircle className="h-4 w-4" />,
};

const categories = [
  { value: "all", label: "All Categories" },
  { value: "payment_issue", label: "Payment Issue" },
  { value: "book_access", label: "Book Access" },
  { value: "audiobook_playback", label: "Audiobook" },
  { value: "subscription", label: "Subscription" },
  { value: "refund", label: "Refund" },
  { value: "hardcopy_delivery", label: "Hardcopy Delivery" },
  { value: "account", label: "Account" },
  { value: "general", label: "General" },
  { value: "other", label: "Other" },
];

export default function AdminTickets() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeTab, setTypeTab] = useState("all");

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets"],
    queryFn: () => utils.admin.listSupportTickets.fetch(),
  });

  const filtered = tickets.filter(t => {
    if (typeTab !== "all" && t.type !== typeTab) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !t.ticket_number?.toLowerCase().includes(s) &&
        !t.user_name?.toLowerCase().includes(s) &&
        !t.user_email?.toLowerCase().includes(s) &&
        !t.user_phone?.toLowerCase().includes(s) &&
        !t.subject?.toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === "open").length,
    in_progress: tickets.filter(t => t.status === "in_progress").length,
    resolved: tickets.filter(t => t.status === "resolved").length,
    closed: tickets.filter(t => t.status === "closed").length,
    urgent: tickets.filter(t => t.priority === "urgent").length,
    complaints: tickets.filter(t => t.type === "complaint").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif text-primary">Support Tickets</h1>
        <p className="text-sm text-muted-foreground">User support & complaint management</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: "Total", value: stats.total, icon: <Ticket className="h-4 w-4" />, color: "text-foreground" },
          { label: "Open", value: stats.open, icon: statusIcons.open, color: "text-blue-400" },
          { label: "In Progress", value: stats.in_progress, icon: statusIcons.in_progress, color: "text-yellow-400" },
          { label: "Resolved", value: stats.resolved, icon: statusIcons.resolved, color: "text-green-400" },
          { label: "Closed", value: stats.closed, icon: statusIcons.closed, color: "text-muted-foreground" },
          { label: "Urgent", value: stats.urgent, icon: <AlertCircle className="h-4 w-4" />, color: "text-red-400" },
          { label: "Complaints", value: stats.complaints, icon: <AlertCircle className="h-4 w-4" />, color: "text-orange-400" },
        ].map(s => (
          <Card key={s.label} className="bg-card/60 border-border/40">
            <CardContent className="p-3 flex items-center gap-2">
              <span className={s.color}>{s.icon}</span>
              <div>
                <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs and Filters */}
      <Tabs value={typeTab} onValueChange={setTypeTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="ticket">Tickets</TabsTrigger>
          <TabsTrigger value="complaint">Complaints</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Ticket number, name, email..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tickets Table */}
      <div className="rounded-lg border border-border/40 bg-card/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No tickets found</TableCell></TableRow>
            ) : filtered.map(t => (
              <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50">
                <TableCell>
                  <Link to={`/admin/ticket/${t.id}`} className="font-mono text-xs text-primary hover:underline">
                    {t.ticket_number}
                  </Link>
                  {t.type === "complaint" && <Badge variant="outline" className="ml-2 text-[10px] text-orange-400 border-orange-400/30">Complaint</Badge>}
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium">{t.user_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{t.user_email || t.user_phone || "—"}</div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-sm">{t.subject}</TableCell>
                <TableCell><Badge variant="outline" className="text-[11px]">{categories.find(c => c.value === t.category)?.label || t.category}</Badge></TableCell>
                <TableCell><Badge className={`text-[11px] ${priorityColors[t.priority] || ""}`}>{t.priority}</Badge></TableCell>
                <TableCell>
                  <Badge className={`text-[11px] gap-1 ${statusColors[t.status] || ""}`}>
                    {statusIcons[t.status]}{t.status === "open" ? "Open" : t.status === "in_progress" ? "In Progress" : t.status === "resolved" ? "Resolved" : "Closed"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
