import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Shield, AlertTriangle, CheckCircle2, Clock, Database, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default function AdminBackupStatus() {
  const { data, isLoading } = trpc.admin.backupStatus.useQuery();

  const lastBackupHours = data?.lastBackupAt ? hoursSince(data.lastBackupAt) : null;
  // Nightly backups are expected — anything past ~36h means the job missed a run.
  const isStale = lastBackupHours !== null && lastBackupHours > 36;
  const isHealthy = data?.configured && data.backups.length > 0 && !isStale;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Database Backup Status
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real backup catalog, read directly from object storage — not a status claim.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.configured ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-destructive/10"><AlertTriangle className="h-8 w-8 text-destructive" /></div>
            <div>
              <h3 className="text-lg font-bold text-destructive">Backups not configured</h3>
              <p className="text-sm text-muted-foreground mt-1">
                No object storage (S3/R2) is configured on this server, so <code className="font-mono">npm run backup:db</code> has nowhere to upload to.
                Set the <code className="font-mono">AWS_S3_*</code> environment variables first.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : data.backups.length === 0 ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-full bg-destructive/10"><AlertTriangle className="h-8 w-8 text-destructive" /></div>
            <div>
              <h3 className="text-lg font-bold text-destructive">No backups found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Object storage is configured but no backup has ever run. Run <code className="font-mono">npm run backup:db</code> manually, then set up a nightly cron/systemd timer for it.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={isHealthy ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${isHealthy ? "bg-emerald-500/10" : "bg-amber-500/10"}`}>
                {isHealthy ? <CheckCircle2 className="h-8 w-8 text-emerald-500" /> : <AlertTriangle className="h-8 w-8 text-amber-500" />}
              </div>
              <div>
                <h3 className={`text-lg font-bold ${isHealthy ? "text-emerald-500" : "text-amber-500"}`}>
                  {isHealthy ? "Backups up to date" : "Last backup is overdue"}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Last backup: {new Date(data.lastBackupAt!).toLocaleString()}
                  {lastBackupHours !== null && ` (${lastBackupHours < 1 ? "under an hour" : `${Math.round(lastBackupHours)}h`} ago)`}
                  {isStale && " — expected nightly, this is stale. Check the backup cron job on the server."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Clock className="h-5 w-5 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold">Nightly</p>
            <p className="text-xs text-muted-foreground">Expected Frequency</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Database className="h-5 w-5 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold">{data?.retentionDays ?? "—"} days</p>
            <p className="text-xs text-muted-foreground">Retention Period</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Database className="h-5 w-5 text-emerald-400 mx-auto mb-2" />
            <p className="text-2xl font-bold">{data?.backups.length ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Backups in Storage</p>
          </CardContent>
        </Card>
      </div>

      {data && data.backups.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" /> Backup History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Size</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.backups.map((b) => (
                  <TableRow key={b.key}>
                    <TableCell className="font-mono text-sm">{b.key.replace("backups/", "")}</TableCell>
                    <TableCell className="text-sm">{new Date(b.lastModified).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatBytes(b.sizeBytes)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">How this works</p>
            <ul className="list-disc list-inside space-y-1">
              <li><code className="font-mono">server/scripts/backup-database.ts</code> runs <code className="font-mono">pg_dump</code>, gzips it, and uploads directly to object storage under <code className="font-mono">backups/</code></li>
              <li>Old backups past the retention window are deleted automatically by the same script</li>
              <li>This page reads the real file listing from storage every time — it can't drift from reality the way a hardcoded status page can</li>
              <li>To restore: download a backup file, decompress it, and run <code className="font-mono">psql $DATABASE_URL &lt; backup.sql</code> against a target database</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
