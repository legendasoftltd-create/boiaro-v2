import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Link2 } from "lucide-react";

interface DuplicateDetectorProps {
  title: string;
  currentBookId?: string;
  onAttachToExisting: (bookId: string) => void;
}

export function DuplicateDetector({ title, currentBookId, onAttachToExisting }: DuplicateDetectorProps) {
  const [debouncedTitle, setDebouncedTitle] = useState("");

  useEffect(() => {
    if (!title || title.length < 3) { setDebouncedTitle(""); return; }
    const timer = setTimeout(() => setDebouncedTitle(title), 500);
    return () => clearTimeout(timer);
  }, [title]);

  const { data: matches = [] } = trpc.books.searchBooksByTitle.useQuery(
    { query: debouncedTitle, excludeId: currentBookId },
    { enabled: debouncedTitle.length >= 3 }
  );

  if (!matches.length) return null;

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-yellow-500 text-sm font-medium">
          <AlertTriangle className="h-4 w-4" />
          Similar books found — consider attaching your format instead
        </div>
        {matches.map(m => (
          <div key={m.id} className="flex items-center justify-between p-2 rounded bg-secondary/30 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              {m.cover_url && <img src={m.cover_url} alt="" className="w-8 h-12 object-cover rounded" />}
              <div className="min-w-0">
                <p className="font-medium truncate">{m.title}</p>
                <Badge variant="outline" className="text-[9px] capitalize">{m.submission_status}</Badge>
              </div>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onAttachToExisting(m.id)}>
              <Link2 className="h-3 w-3" /> Attach
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
