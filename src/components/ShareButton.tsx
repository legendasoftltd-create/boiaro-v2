import { useState } from "react"
import { Share2, Copy, Check, Link2, Mail, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { toast } from "sonner"

/**
 * Every destination we can share to without registering anything, plus
 * Messenger, which needs a Facebook App ID and is therefore only offered when
 * VITE_FACEBOOK_APP_ID is configured (it is in production).
 *
 * The link itself carries the preview: the server renders Open Graph tags for
 * /live/:id, /schedule/:id and /book/:slug (server/src/middleware/social-bot.ts),
 * so pasting it anywhere shows the title, description and cover image. Nothing
 * here has to attach the image — it only has to share the right URL.
 */
function buildTargets(url: string, title: string, image?: string) {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(title)
  const both = encodeURIComponent(`${title}\n${url}`)
  const fbAppId = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined

  const targets = [
    { key: "whatsapp",  label: "WhatsApp",  href: `https://wa.me/?text=${both}`,                                          className: "bg-emerald-500/10 text-emerald-500" },
    { key: "facebook",  label: "Facebook",  href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,                    className: "bg-blue-500/10 text-blue-500" },
    { key: "x",         label: "X",         href: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,                  className: "bg-foreground/10 text-foreground" },
    { key: "telegram",  label: "Telegram",  href: `https://t.me/share/url?url=${u}&text=${t}`,                            className: "bg-sky-500/10 text-sky-500" },
    { key: "linkedin",  label: "LinkedIn",  href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,             className: "bg-blue-600/10 text-blue-600" },
    { key: "reddit",    label: "Reddit",    href: `https://www.reddit.com/submit?url=${u}&title=${t}`,                    className: "bg-orange-500/10 text-orange-500" },
    { key: "pinterest", label: "Pinterest", href: `https://pinterest.com/pin/create/button/?url=${u}&description=${t}${image ? `&media=${encodeURIComponent(image)}` : ""}`, className: "bg-red-500/10 text-red-500" },
    { key: "email",     label: "ইমেইল",     href: `mailto:?subject=${t}&body=${both}`,                                    className: "bg-muted text-muted-foreground" },
    { key: "sms",       label: "SMS",       href: `sms:?&body=${both}`,                                                   className: "bg-muted text-muted-foreground" },
  ]

  if (fbAppId) {
    targets.splice(2, 0, {
      key: "messenger", label: "Messenger",
      href: `https://www.facebook.com/dialog/send?app_id=${encodeURIComponent(fbAppId)}&link=${u}&redirect_uri=${u}`,
      className: "bg-indigo-500/10 text-indigo-500",
    })
  }
  return targets
}

const ICONS: Record<string, JSX.Element> = {
  whatsapp:  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12.001 2C6.478 2 2 6.478 2 12c0 1.822.487 3.53 1.338 5.003L2 22l5.13-1.35A9.947 9.947 0 0 0 12 22c5.523 0 10-4.478 10-10S17.523 2 12 2zm0 18.13a8.09 8.09 0 0 1-4.13-1.13l-.296-.176-3.048.8.813-2.97-.193-.306A8.088 8.088 0 0 1 3.87 12c0-4.484 3.647-8.13 8.13-8.13 4.484 0 8.13 3.646 8.13 8.13 0 4.483-3.646 8.13-8.13 8.13zm4.471-6.748c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>,
  facebook:  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M22 12.06C22 6.505 17.523 2 12 2S2 6.505 2 12.06c0 5.02 3.657 9.184 8.438 9.94v-7.03H7.898v-2.91h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562v1.877h2.773l-.443 2.91h-2.33V22c4.78-.756 8.437-4.92 8.437-9.94z"/></svg>,
  messenger: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.9 1.19 5.42 3.14 7.17.16.15.26.35.27.57l.05 1.78c.02.57.6.94 1.12.71l1.99-.88c.17-.07.36-.09.54-.04 1.19.33 2.45.5 3.79.5 5.64 0 10-4.13 10-9.7S17.64 2 12 2zm5.63 7.65-2.9 4.6c-.46.73-1.45.91-2.14.39l-2.31-1.73a.6.6 0 0 0-.72 0l-3.12 2.37c-.42.31-.96-.19-.68-.63l2.9-4.6c.46-.73 1.45-.91 2.14-.39l2.31 1.73a.6.6 0 0 0 .72 0l3.12-2.37c.42-.31.96.19.68.63z"/></svg>,
  x:         <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  telegram:  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>,
  linkedin:  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>,
  reddit:    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12.6c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/></svg>,
  pinterest: <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 0a12 12 0 0 0-4.373 23.178c-.017-.362-.032-.918.007-1.314.036-.386.234-2.46.234-2.46s-.06-.12-.06-.297c0-.278.161-.486.362-.486.171 0 .253.128.253.282 0 .172-.11.429-.166.667-.047.2.1.363.297.363.357 0 .632-.376.632-.92 0-.48-.345-.817-.838-.817-.571 0-.906.428-.906.871 0 .172.066.357.149.457a.06.06 0 0 1 .014.058c-.015.063-.049.2-.056.228-.009.037-.03.045-.069.027-.257-.12-.418-.496-.418-.798 0-.65.472-1.246 1.36-1.246.715 0 1.27.509 1.27 1.189 0 .71-.447 1.28-1.068 1.28-.209 0-.405-.108-.472-.236l-.128.49c-.047.178-.174.402-.259.538A12 12 0 1 0 12 0z"/></svg>,
  email:     <Mail className="w-4 h-4" />,
  sms:       <MessageSquare className="w-4 h-4" />,
}

export function ShareButton({
  title, url, image, description, className,
}: {
  title: string
  url: string
  /** Cover/artwork shown in the sheet. The link's own OG tags drive the preview elsewhere. */
  image?: string
  description?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const targets = buildTargets(url, title, image)
  const host = (() => { try { return new URL(url).host } catch { return url } })()

  const handleTrigger = async (e: React.MouseEvent) => {
    // Mobile: the OS sheet already lists every installed app, so prefer it.
    // Desktop browsers mostly don't implement navigator.share and fall through.
    if (navigator.share) {
      e.preventDefault()
      try {
        await navigator.share({ title, text: description, url })
        setOpen(false)
      } catch { setOpen(true) /* cancelled — show our own sheet */ }
    }
  }

  const copyLink = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    toast.success("লিংক কপি হয়েছে")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className={className} title="শেয়ার করুন" aria-label="শেয়ার করুন" onClick={handleTrigger}>
          <Share2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[19rem] p-0 overflow-hidden" align="end">
        {/* What you're about to share — thumbnail, title, destination */}
        <div className="flex items-center gap-3 p-3 border-b border-border bg-secondary/40">
          {image ? (
            <img
              src={image}
              alt=""
              className="w-11 h-11 rounded-lg object-cover shrink-0 bg-muted"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none" }}
            />
          ) : (
            <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight line-clamp-2">{title}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{host}</p>
          </div>
        </div>

        <div className="p-3">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">শেয়ার করুন</p>
          <div className="grid grid-cols-4 gap-1">
            {targets.map((t) => (
              <a
                key={t.key}
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                title={t.label}
                className="flex flex-col items-center gap-1.5 py-2 rounded-lg hover:bg-secondary transition-colors"
              >
                <span className={`w-9 h-9 rounded-full flex items-center justify-center ${t.className}`}>
                  {ICONS[t.key]}
                </span>
                <span className="text-[10px] text-muted-foreground leading-none truncate max-w-full px-0.5">{t.label}</span>
              </a>
            ))}
          </div>

          <button
            onClick={copyLink}
            className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary transition-colors text-left"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <Copy className="w-4 h-4 text-muted-foreground shrink-0" />}
            <span className="text-xs truncate flex-1 text-muted-foreground">{url}</span>
            <span className="text-[11px] font-medium shrink-0">{copied ? "কপি হয়েছে" : "কপি"}</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
