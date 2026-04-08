import { useState, useEffect } from "react"
import { useRjProfile } from "@/hooks/useLiveSession"
import { supabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Save, Loader2, User } from "lucide-react"
import { toast } from "sonner"

export default function RjProfile() {
  const { profile, loading } = useRjProfile()
  const [form, setForm] = useState({
    stage_name: "",
    bio: "",
    specialty: "",
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        stage_name: profile.stage_name || "",
        bio: profile.bio || "",
        specialty: profile.specialty || "",
      })
    }
  }, [profile])

  const handleSave = async () => {
    if (!profile) return
    if (!form.stage_name.trim()) {
      toast.error("Stage name is required")
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from("rj_profiles")
      .update({
        stage_name: form.stage_name.trim(),
        bio: form.bio.trim() || null,
        specialty: form.specialty.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)

    setSaving(false)
    if (error) {
      toast.error("Failed to update profile")
    } else {
      toast.success("Profile updated!")
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>No RJ profile found. Contact admin.</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold font-serif">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" /> RJ Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Stage Name *</Label>
            <Input
              value={form.stage_name}
              onChange={(e) => setForm(f => ({ ...f, stage_name: e.target.value }))}
              placeholder="RJ Kobi"
            />
          </div>
          <div className="space-y-2">
            <Label>Specialty</Label>
            <Input
              value={form.specialty}
              onChange={(e) => setForm(f => ({ ...f, specialty: e.target.value }))}
              placeholder="Poetry, Stories, Music..."
            />
          </div>
          <div className="space-y-2">
            <Label>Bio</Label>
            <Textarea
              value={form.bio}
              onChange={(e) => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Tell listeners about yourself..."
              rows={4}
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <span className={`w-2 h-2 rounded-full ${profile.is_approved ? "bg-emerald-400" : "bg-amber-400"}`} />
            {profile.is_approved ? "Approved" : "Pending Approval"}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Profile
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
