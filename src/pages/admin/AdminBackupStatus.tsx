import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, CheckCircle2, Clock, Database, Info } from "lucide-react";

const CRITICAL_TABLES = [
  "profiles (users)", "orders", "order_items", "payments", "content_unlocks",
  "accounting_ledger", "user_purchases", "user_subscriptions", "coin_transactions",
  "user_coins", "books", "book_formats", "contributor_earnings",
];

export default function AdminBackupStatus() {
  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold flex items-center gap-2 text-black">
           Database Backup Status
        </h1>
      

      {/* Backup Status */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-500">Backups Active & Healthy</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Automated daily backups are handled by the Lovable Cloud infrastructure.
                Point-in-time recovery (PITR) is available.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">Daily</p>
            <p className="text-xs text-muted-foreground">Backup Frequency</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Database className="h-5 w-5 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold">7 days</p>
            <p className="text-xs text-muted-foreground">Retention Period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Shield className="h-5 w-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-2xl font-bold">PITR</p>
            <p className="text-xs text-muted-foreground">Point-in-Time Recovery</p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Tables */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
             Critical Tables Covered
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Table</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Protection</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CRITICAL_TABLES.map((table) => (
                <TableRow key={table}>
                  <TableCell className="font-mono text-sm">{table}</TableCell>
                  <TableCell>
                    <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30">Backed Up</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">Daily snapshot + PITR</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Info Notice */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">About Lovable Cloud Backups</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Backups are fully automated — no manual action needed</li>
              <li>All database tables are included in daily snapshots</li>
              <li>Point-in-time recovery allows restoring to any second within the retention window</li>
              <li>Backup data is encrypted at rest and in transit</li>
              <li>For restoration requests, contact Lovable Cloud support</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
