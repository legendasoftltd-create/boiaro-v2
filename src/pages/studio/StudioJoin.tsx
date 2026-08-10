import { useEffect, useRef, useState } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? ""

export default function StudioJoin() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true

    const redeem = async () => {
      // ProtectedRoute (wrapping this route) already guarantees we're logged
      // in before this component renders — access_token is expected here.
      const accessToken = localStorage.getItem("access_token")
      try {
        const res = await fetch(`${API_BASE}/api/v1/studio/join/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: "{}",
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.message || "Invite link ব্যবহার করা যায়নি")

        navigate(`/studio/${data.sessionId}`, {
          replace: true,
          state: { token: data.token, url: data.url, role: data.role },
        })
      } catch (err: any) {
        setError(err.message || "কিছু একটা ভুল হয়েছে")
        toast.error(err.message || "Invite link ব্যবহার করা যায়নি")
      }
    }
    redeem()
  }, [token, navigate])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center px-4">
      {error ? (
        <p className="text-sm text-destructive max-w-sm">{error}</p>
      ) : (
        <>
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Studio-তে যুক্ত হচ্ছে...</p>
        </>
      )}
    </div>
  )
}
