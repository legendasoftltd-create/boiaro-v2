import { UserPlus, UserCheck, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useFollow } from "@/hooks/useFollow"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"

interface Props {
  profileId: string
  profileType: "author" | "narrator" | "publisher"
  showCount?: boolean
  size?: "sm" | "default" | "icon"
  className?: string
}

export function FollowButton({ profileId, profileType, showCount = false, size = "sm", className = "" }: Props) {
  const { user } = useAuth()
  const { isFollowing, followersCount, loading, toggling, toggle } = useFollow({ profileId, profileType })

  const handleClick = async () => {
    if (!user) {
      toast.error("Please login to follow this " + profileType)
      return
    }
    const ok = await toggle()
    if (ok) {
      toast.success(isFollowing ? "Unfollowed" : "Following!")
    }
  }

  if (loading) {
    return (
      <Button variant="outline" size={size} disabled className={className}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={isFollowing ? "secondary" : "default"}
        size={size}
        onClick={handleClick}
        disabled={toggling}
        className={`gap-1.5 transition-all ${className}`}
      >
        {toggling ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : isFollowing ? (
          <UserCheck className="w-3.5 h-3.5" />
        ) : (
          <UserPlus className="w-3.5 h-3.5" />
        )}
        {isFollowing ? "Following" : "Follow"}
      </Button>
      {showCount && (
        <span className="text-xs text-muted-foreground">
          {followersCount.toLocaleString()} {followersCount === 1 ? "follower" : "followers"}
        </span>
      )}
    </div>
  )
}
