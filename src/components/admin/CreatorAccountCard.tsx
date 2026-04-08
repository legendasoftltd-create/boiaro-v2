import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { User, Link2, Unlink, RefreshCw, Search, ExternalLink, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface LinkedUser {
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  linked_at: string | null;
  roles: string[];
}

interface ExistingLink {
  type: string;
  name: string;
}

interface SearchResult {
  user_id: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  phone: string | null;
  roles: string[];
  existing_links: ExistingLink[];
}

interface CreatorAccountCardProps {
  profileId: string;
  profileName: string;
  profileTable: "authors" | "publishers" | "narrators";
  creatorRole: "writer" | "publisher" | "narrator";
  userId: string | null;
  onLinkChanged: () => void;
}

export function CreatorAccountCard({ profileId, profileName, profileTable, creatorRole, userId, onLinkChanged }: CreatorAccountCardProps) {
  const navigate = useNavigate();
  const [linkedUser, setLinkedUser] = useState<LinkedUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState(false);
  const [changeLinkTarget, setChangeLinkTarget] = useState<SearchResult | null>(null);

  const profileTypeLabel = profileTable.slice(0, -1); // "author" / "publisher" / "narrator"

  useEffect(() => {
    if (userId) fetchLinkedUser(userId);
    else setLinkedUser(null);
  }, [userId]);

  const fetchLinkedUser = async (uid: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-creator", {
        body: { action: "get_linked_user", userId: uid, profileTable, profileId },
      });
      if (!error && !data?.error) setLinkedUser(data.user);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-creator", {
        body: { action: "unlink_profile", profileTable, profileId },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Unlink failed");
      } else {
        toast.success(data.message || "Account unlinked");
        setLinkedUser(null);
        onLinkChanged();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUnlinking(false);
      setUnlinkOpen(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) { toast.error("Enter at least 2 characters"); return; }
    setSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-creator", {
        body: { action: "search_users", query: searchQuery.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Search failed");
      } else {
        setSearchResults(data.users || []);
        if (!data.users?.length) toast.info("No users found");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  };

  const handleLinkUser = async (targetUserId: string, targetEmail: string | null) => {
    if (!targetEmail) { toast.error("User has no email"); return; }
    setLinking(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-creator", {
        body: { action: "link_existing", email: targetEmail, role: creatorRole, profileTable, profileId },
      });
      if (error || data?.error) {
        toast.error(data?.error || error?.message || "Link failed");
      } else {
        toast.success(data.message || "Linked successfully");
        setSearchMode(false);
        setSearchQuery("");
        setSearchResults([]);
        setChangeLinkTarget(null);
        onLinkChanged();
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLinking(false);
    }
  };

  const initiateLink = (user: SearchResult) => {
    if (userId) {
      setChangeLinkTarget(user);
    } else {
      handleLinkUser(user.user_id, user.email);
    }
  };

  // Not linked
  if (!userId) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-4 rounded-lg border border-dashed border-border/60 bg-muted/20">
          <Unlink className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground flex-1">No account linked</span>
          <Badge variant="outline" className="text-xs">Not Linked</Badge>
        </div>
        {!searchMode ? (
          <Button size="sm" variant="outline" onClick={() => setSearchMode(true)} className="w-full">
            <Search className="h-3.5 w-3.5 mr-2" />Search & Link User
          </Button>
        ) : (
          <UserSearchPanel
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            searching={searching} onSearch={handleSearch}
            results={searchResults} linking={linking}
            onLink={initiateLink} profileType={profileTypeLabel}
            onCancel={() => { setSearchMode(false); setSearchQuery(""); setSearchResults([]); }}
          />
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 rounded-lg border border-border/40 bg-muted/20">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading account info...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-lg border border-border/40 bg-secondary/30 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Linked Account</span>
          </div>
          <Badge variant="secondary" className="text-xs border border-primary/20">Connected</Badge>
        </div>

        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={linkedUser?.avatar_url || undefined} />
            <AvatarFallback className="bg-secondary text-muted-foreground"><User className="h-4 w-4" /></AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-medium truncate">{linkedUser?.display_name || "—"}</p>
            <p className="text-xs text-muted-foreground truncate">{linkedUser?.email || "—"}</p>
            {linkedUser?.phone && <p className="text-xs text-muted-foreground">{linkedUser.phone}</p>}
            <div className="flex flex-wrap gap-1 mt-1">
              {linkedUser?.roles?.map((r) => (
                <Badge key={r} variant="secondary" className="text-[10px] px-1.5 py-0">{r}</Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t border-border/30">
          <div>
            <span className="block font-medium text-foreground/70">User ID</span>
            <span className="font-mono truncate block">{linkedUser?.user_id?.slice(0, 8)}...</span>
          </div>
          <div>
            <span className="block font-medium text-foreground/70">Linked Since</span>
            <span>{linkedUser?.linked_at ? new Date(linkedUser.linked_at).toLocaleDateString() : linkedUser?.created_at ? new Date(linkedUser.created_at).toLocaleDateString() : "—"}</span>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => navigate(`/admin/user/user/${linkedUser?.user_id}`)}>
            <ExternalLink className="h-3 w-3 mr-1" />View User
          </Button>
          <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => setSearchMode(true)}>
            <RefreshCw className="h-3 w-3 mr-1" />Change Link
          </Button>
          <Button size="sm" variant="destructive" className="text-xs h-8" onClick={() => setUnlinkOpen(true)}>
            <Unlink className="h-3 w-3 mr-1" />Unlink
          </Button>
        </div>
      </div>

      {searchMode && (
        <UserSearchPanel
          searchQuery={searchQuery} setSearchQuery={setSearchQuery}
          searching={searching} onSearch={handleSearch}
          results={searchResults} linking={linking}
          onLink={initiateLink} profileType={profileTypeLabel}
          onCancel={() => { setSearchMode(false); setSearchQuery(""); setSearchResults([]); }}
        />
      )}

      <AlertDialog open={unlinkOpen} onOpenChange={setUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" /> Unlink Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the linked account from <strong>{profileName}</strong> and stop earnings tracking. The creator's role will be revoked and they will lose access to creator panels. Historical earnings will be preserved. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnlink} disabled={unlinking} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {unlinking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Yes, Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!changeLinkTarget} onOpenChange={(o) => { if (!o) setChangeLinkTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-primary" /> Change Linked Account</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">You are about to change the linked account for <strong>{profileName}</strong>.</span>
              <span className="block text-xs"><strong>Current:</strong> {linkedUser?.display_name} ({linkedUser?.email})</span>
              <span className="block text-xs"><strong>New:</strong> {changeLinkTarget?.display_name} ({changeLinkTarget?.email})</span>
              <span className="block text-xs text-muted-foreground mt-1">Historical earnings under the old account will be preserved. Future earnings will go to the new account.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={linking}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => changeLinkTarget && handleLinkUser(changeLinkTarget.user_id, changeLinkTarget.email)} disabled={linking}>
              {linking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserSearchPanel({
  searchQuery, setSearchQuery, searching, onSearch, results, linking, onLink, profileType, onCancel,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  searching: boolean;
  onSearch: () => void;
  results: SearchResult[];
  linking: boolean;
  onLink: (user: SearchResult) => void;
  profileType: string;
  onCancel: () => void;
}) {
  return (
    <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2">
      <Label className="text-xs font-medium">Search User to Link</Label>
      <div className="flex gap-2">
        <Input
          placeholder="Email, name, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="default" onClick={onSearch} disabled={searching} className="h-8 px-3">
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="max-h-52 overflow-y-auto space-y-1">
          {results.map((u) => (
            <div key={u.user_id} className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/60 transition-colors">
              <Avatar className="h-7 w-7">
                <AvatarImage src={u.avatar_url || undefined} />
                <AvatarFallback className="bg-secondary text-muted-foreground text-[10px]"><User className="h-3 w-3" /></AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{u.display_name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.email || u.phone || "—"}</p>
                {u.existing_links?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {u.existing_links.map((link, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-600">
                        Linked: {link.type} "{link.name}"
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-0.5 flex-shrink-0">
                {u.roles?.slice(0, 2).map((r) => (
                  <Badge key={r} variant="secondary" className="text-[9px] px-1 py-0">{r}</Badge>
                ))}
              </div>
              <Button
                size="sm"
                variant={u.existing_links?.some(l => l.type === profileType) ? "destructive" : "outline"}
                className="h-6 text-[10px] px-2 flex-shrink-0"
                onClick={() => onLink(u)}
                disabled={linking}
              >
                {u.existing_links?.some(l => l.type === profileType) ? "Linked!" : "Link"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button size="sm" variant="ghost" className="w-full text-xs h-7" onClick={onCancel}>Cancel</Button>
    </div>
  );
}
