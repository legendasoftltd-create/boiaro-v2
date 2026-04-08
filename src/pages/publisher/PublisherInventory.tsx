import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function PublisherInventory() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-bold">Inventory Management</h1>
      <Card className="border-border/30 bg-card/60">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="w-4 h-4 text-emerald-400" /> Stock & Formats</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Manage your book inventory and format availability here.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
