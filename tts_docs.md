# 📘 Premium Voice (TTS) — সম্পূর্ণ Setup Manual
### Boiaro Platform — Developer Handover Document

---

## 🎯 Overview (সংক্ষেপে)

আমাদের প্ল্যাটফর্মে দুই ধরনের Voice আছে:

| Mode | Engine | Cost | Quality |
|---|---|---|---|
| **Free** | gTTS / Browser TTS | ফ্রি | সাধারণ |
| **Premium (AI HD)** | ElevenLabs | পেইড (কয়েন বা সাবস্ক্রিপশন) | স্টুডিও কোয়ালিটি |

User → Premium voice select করলে → Backend → ElevenLabs API call → Audio cache → Play।

---

# 1️⃣ USER PANEL — যা ইউজার দেখবে ও করবে

## 🔹 A. eBook Reader-এ TTS Settings
**Location:** Reader Settings Sheet (গিয়ার আইকন)

### দৃশ্যমান উপাদান:
- 🎚️ **Voice Mode Toggle**
  - ⚪ Standard (Free) — সবার জন্য খোলা
  - 🟡 **AI HD Premium** — Badge সহ (`AI HD` লেবেল)
- 🆕 **"নতুন" Pulse Badge** — প্রথম ভিজিটে দেখাবে (localStorage flag)
- 💰 **Inline Coin Price** — Locked state-এ "৫ কয়েন/অধ্যায়" দেখাবে
- 📝 **Descriptive Hint** — "প্রিমিয়াম ভয়েসে আরও স্বাভাবিক বাংলা উচ্চারণ"
- 🎙️ **Voice Selector** — Sarah, Lily, George ইত্যাদি (Bengali-friendly voice list)
- ⚡ **Speed Slider** — 0.7x - 1.2x
- 🔊 **Volume Control**

### User Flow:
1. Reader খুলবে → Settings → "AI HD" select করবে
2. যদি premium unlock না থাকে → Coin payment modal দেখাবে
3. Unlock হওয়ার পর → অডিও generate হবে → প্লে শুরু
4. পরবর্তী paragraph **প্রি-জেনারেট** হবে background-এ (lookahead buffer)

## 🔹 B. Audiobook Player
- একই Voice mode toggle
- 15% Preview limit (free users)
- Quick Unlock UX: কয়েন/অ্যাড দিয়ে আনলক

## 🔹 C. ইউজারের Wallet/Profile-এ
- 💎 **Coin Balance** দেখাবে
- 📜 **TTS Usage History** — কতবার premium ব্যবহার করেছে
- 🎁 **Quota Status** — মাসিক ফ্রি limit (যদি থাকে)

## 🔹 D. Notifications/Toasts
| Situation | Toast Message |
|---|---|
| Quota শেষ | "প্রিমিয়াম ভয়েস সাময়িকভাবে ব্যস্ত… স্ট্যান্ডার্ড ভয়েসে চলছে।" |
| Generate হচ্ছে | "AI ভয়েস তৈরি হচ্ছে…" |
| Cache hit | (silent — instant play) |
| Coin insufficient | "আপনার কয়েন কম, রিচার্জ করুন" |

---

# 2️⃣ ADMIN PANEL — যা অ্যাডমিন দেখবে ও কন্ট্রোল করবে

## 🔹 A. TTS Dashboard (নতুন সেকশন)
**Route:** `/admin/tts-management`

### Stats Cards:
- 📊 আজকের Total TTS Requests
- 💰 আজকের ElevenLabs Cost (estimate)
- 🎯 Cache Hit Rate (%) — যত বেশি, তত সস্তা
- 👥 Active Premium Users
- ⚠️ Quota Used / Remaining (ElevenLabs subscription)

### Charts:
- 📈 Daily TTS usage (last 30 days)
- 🥧 Free vs Premium ratio
- 📉 Cost trend

## 🔹 B. Voice Configuration
- 🎙️ **Voice Library Management**
  - কোন voice IDs available দেখাবে
  - Default voice select
  - Voice enable/disable toggle
- ⚙️ **Default Settings** edit
  - Stability, Similarity, Style sliders
  - Model select (multilingual_v2 / turbo_v2_5)

## 🔹 C. Pricing Control
- 💵 **Coin Cost per Chapter** — admin-editable
- 🎁 **Free Quota per User** (মাসিক char limit)
- 📦 **Subscription Plans** (যদি থাকে)

## 🔹 D. User Management
- 🔍 ইউজার সার্চ → তার TTS usage দেখা
- 🎫 Manual coin grant
- 🚫 Premium access revoke
- 📋 Per-user usage history

## 🔹 E. Cache Management
- 🗂️ **Cache Browser** — কোন audio files cached আছে
- 🗑️ **Clear cache** button (specific বা all)
- 📊 Cache size (MB/GB)
- 🧹 Auto-cleanup policy (e.g., 30 দিনের পুরাতন delete)

## 🔹 F. Alerts & Limits
- ⚠️ **Quota Alert** — ElevenLabs 80% শেষ হলে email/notification
- 💸 **Cost Alert** — মাসিক বাজেট ক্রস হলে warning
- 🔴 **Auto-disable** — Quota 100% হলে auto fallback to gTTS

## 🔹 G. Logs & Audit
- 📜 প্রতিটি TTS request log (user, text length, cost, cached?)
- ❌ Error logs (failed requests)
- 🔄 Fallback events (when premium → free)

---

# 3️⃣ BACKEND / DEVELOPER — যা যা কাজ করতে হবে

## 🔹 STEP 1: ElevenLabs Account Setup
1. https://elevenlabs.io → Sign up
2. **Subscription কিনুন:**
   | Plan | Char/মাস | Price | Recommended |
   |---|---|---|---|
   | Free | 10K | $0 | Testing only |
   | Starter | 30K | $5 | Small launch |
   | Creator | 100K | $22 | ✅ Production start |
   | Pro | 500K | $99 | ✅ Scale |
   | Scale | 2M | $330 | High traffic |
3. Profile → **API Keys** → Create new → Copy

## 🔹 STEP 2: Environment Setup
নতুন server-এ এই secret গুলো যোগ করুন:
```bash
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxx
```
⚠️ **API key কখনই frontend code-এ রাখবেন না।**

## 🔹 STEP 3: Database Schema
নিচের tables তৈরি করুন:

```sql
-- TTS Audio Cache
CREATE TABLE tts_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text_hash TEXT NOT NULL UNIQUE,  -- SHA-256 of text+voice+settings
  voice_id TEXT NOT NULL,
  language TEXT DEFAULT 'bn',
  audio_url TEXT NOT NULL,         -- Supabase Storage URL
  char_count INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_tts_cache_hash ON tts_cache(text_hash);

-- User TTS Usage Tracking
CREATE TABLE user_tts_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  month TEXT NOT NULL,             -- 'YYYY-MM'
  char_count INT DEFAULT 0,
  request_count INT DEFAULT 0,
  premium_count INT DEFAULT 0,
  UNIQUE(user_id, month)
);

-- Premium Unlocks (per chapter/book)
CREATE TABLE tts_premium_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  book_id UUID NOT NULL,
  chapter_id UUID,
  coins_spent INT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ        -- NULL = forever
);

-- Admin Settings
CREATE TABLE tts_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Insert defaults: coin_cost, default_voice, quota_limit, etc.
```

**RLS Policies:**
- `tts_cache` — Public read (cached audio shareable)
- `user_tts_usage` — User shুধু নিজের data
- `tts_premium_unlocks` — User শুধু নিজের
- `tts_settings` — শুধু admin role

## 🔹 STEP 4: Storage Bucket
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('tts-audio', 'tts-audio', true);
```
⚠️ Public bucket কারণ cached audio CDN-এ serve হবে।

## 🔹 STEP 5: Edge Functions (যা Build করতে হবে)

### 1. `premium-tts` (মূল function)
**Job:** Text → ElevenLabs → MP3 → Cache → Return URL

```typescript
// premium-tts/index.ts
1. Validate user JWT
2. Check user has unlock OR sufficient coins
3. Generate SHA-256 hash of (text + voice + settings)
4. Check tts_cache table
5. If hit → return cached URL (instant)
6. If miss:
   a. Call ElevenLabs API
   b. Upload MP3 to Supabase Storage
   c. Insert into tts_cache
   d. Update user_tts_usage
   e. Deduct coins (if applicable)
   f. Return new URL
7. Handle errors → fallback to gTTS
```

### 2. `tts-quota-check`
**Job:** ব্যবহারের আগে quota check

### 3. `tts-unlock-chapter`
**Job:** কয়েন কেটে unlock create করা (idempotent)

### 4. `tts-admin-stats`
**Job:** Admin dashboard-এর stats আনা (admin only)

### 5. `tts-cache-cleanup` (Cron)
**Job:** ৩০ দিনের পুরাতন unused cache delete

## 🔹 STEP 6: Frontend Files (যা copy/integrate করতে হবে)

| File | Purpose |
|---|---|
| `src/hooks/usePremiumTTS.ts` | Main TTS hook |
| `src/hooks/useTTSQuota.ts` | Quota tracking |
| `src/components/ebook-reader/TtsFullPlayer.tsx` | Full player UI |
| `src/components/ebook-reader/ReaderSettingsSheet.tsx` | Voice toggle |
| `src/components/ebook-reader/PremiumVoiceBadge.tsx` | "AI HD" badge |
| `src/components/admin/TTSManagement.tsx` | Admin dashboard |

## 🔹 STEP 7: Critical Configuration

### ElevenLabs API Settings (use these exactly):
```typescript
{
  model_id: "eleven_multilingual_v2",  // বাংলার জন্য
  output_format: "mp3_44100_128",      // ⚠️ URL query param!
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.5,
    use_speaker_boost: true,
    speed: 1.0
  }
}
```

### Bengali Voice IDs (tested):
- Sarah — `EXAVITQu4vr4xnSDxMaL`
- Lily — `pFZP5JQG7iQjIQuC4Bku`
- George — `JBFqnCBsd6RMkjVDRZzb`

## 🔹 STEP 8: Bangla Optimization
- পূর্ণ বিরাম (`।`) → 400ms pause
- কমা (`,`) → 200ms pause
- Question mark (`?`) → tone rise
- 3-paragraph lookahead buffer (preload)

---

# 4️⃣ TESTING CHECKLIST

ডেভেলপার deploy-এর আগে verify করবে:

## Backend:
- [ ] ELEVENLABS_API_KEY env variable set
- [ ] Tables created with RLS
- [ ] Storage bucket public
- [ ] Edge functions deployed
- [ ] Cron job configured

## Functional:
- [ ] ছোট বাংলা টেক্সট → audio generate হচ্ছে
- [ ] একই text 2nd time → cache থেকে আসছে (instant)
- [ ] কয়েন deduct হচ্ছে correctly
- [ ] Quota শেষে gTTS fallback হচ্ছে
- [ ] Toast messages দেখাচ্ছে
- [ ] Admin dashboard stats correct
- [ ] Mobile + Desktop দুই জায়গায় play হচ্ছে

## Performance:
- [ ] First-time generate < 5 sec
- [ ] Cached play < 500ms
- [ ] Lookahead buffer working
- [ ] No CORS errors

## Security:
- [ ] API key only in backend
- [ ] RLS policies active
- [ ] Non-premium user premium audio দেখতে পাচ্ছে না
- [ ] Admin endpoints admin-only

---

# 5️⃣ COMMON PITFALLS (যা এড়াবেন)

| ❌ Wrong | ✅ Right |
|---|---|
| `output_format` body-তে | URL query param-এ |
| `btoa(...)` audio buffer-এ | `base64Encode()` from std lib |
| Client-এ API key | শুধু server env |
| Caching ছাড়া deploy | অবশ্যই SHA-256 cache |
| একসাথে 5000+ char | Paragraph-wise split |
| JSON parse binary audio | `.blob()` or `.arrayBuffer()` |

---

# 6️⃣ COST ESTIMATION

ধরা যাক 100 active premium users প্রতিদিন:
- প্রতি user-এর 1 chapter = ~3000 char
- Total daily = 300,000 char
- মাসিক = 9 million char

| Plan | Coverage | Monthly Cost |
|---|---|---|
| Pro (500K) | 5% | $99 (overage হবে) |
| Scale (2M) | 22% | $330 |
| Business (custom) | Full | Negotiable |

**💡 Tip:** Cache hit rate 60%+ হলে actual cost 40% কমে যাবে।

---

# 7️⃣ HANDOVER PACKAGE — ডেভেলপারকে যা পাঠাবেন

📦 ফাইল লিস্ট:
1. ✅ এই Manual (PDF/MD)
2. ✅ ElevenLabs API Key (securely — Bitwarden/1Password)
3. ✅ Database schema SQL file
4. ✅ Edge function source code (zip)
5. ✅ Frontend hooks + components
6. ✅ Voice ID list
7. ✅ Brand guidelines (badge color, "AI HD" label)
8. 🔗 ElevenLabs docs: https://elevenlabs.io/docs

---

# 8️⃣ POST-LAUNCH MONITORING

প্রতি সপ্তাহে check করুন:
- 📊 ElevenLabs usage dashboard
- 💰 Cost vs Revenue (premium unlocks)
- 🎯 Cache hit rate (target: 60%+)
- 😊 User feedback (voice quality)
- ⚠️ Error rate (target: <1%)

---