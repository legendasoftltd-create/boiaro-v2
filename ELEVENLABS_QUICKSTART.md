# ElevenLabs TTS Integration - Quick Start

## ✅ What's Been Set Up

### Backend
- ✅ **tRPC Router** created at `server/src/routers/tts.ts` with 3 endpoints:
  - `getOrGenerateAudio` (Query) - Get or generate audio
  - `generateAudio` (Mutation) - Force generate new audio
  - `clearOldCache` (Mutation) - Clean old cached audio

- ✅ **Router registered** in `server/src/routers/_app.ts`

### Frontend
- ✅ **Hook updated** `src/hooks/usePremiumTTS.ts` 
  - Calls backend TTS API via HTTP fetch
  - Automatically handles caching
  - Supports paragraph prefetching

### Database
- ✅ **Schema already exists** with `TtsAudio` model
- ✅ **No migration needed** - table is ready to use

## 🚀 Getting Started

### 1. Get ElevenLabs API Key
```bash
# Go to https://elevenlabs.io/app/sign-up
# Create account → Account → API Key → Copy
```

### 2. Set Environment Variables

**Server (add to `.env` or `server/.env`):**
```env
ELEVENLABS_API_KEY=sk_YOUR_KEY_HERE
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

**Reference file:** `.env.elevenlabs.example`

### 3. Restart Server
```bash
# Stop running server (Ctrl+C)
# Restart with new env vars
npm run dev
```

### 4. Test the Integration
- Navigate to an audiobook detail page
- Enable "Premium TTS" mode
- Click to play - audio should generate on first load, then cache

## 🎯 Voice Options

Popular ElevenLabs voices:

| Voice ID | Name | Type | Best For |
|----------|------|------|----------|
| `21m00Tcm4TlvDq8ikWAM` | George | Professional, neutral | General narration |
| `EXAVITQu4vr4xnSDxMaL` | Bella | Warm, friendly | Fiction, storytelling |
| `TxGEqnHWrfWFTfGW9XjX` | Chris | Calm, measured | Educational, technical |
| `VR6AewLVLomS5PPF0QU5` | Elli | Young, energetic | Young audiences |

[See all voices →](https://elevenlabs.io/docs/voices)

To change voices, update `ELEVENLABS_VOICE_ID` in environment variables.

## 📊 Architecture

```
User Request
    ↓
Frontend Hook (usePremiumTTS.ts)
    ↓
HTTP Fetch to /trpc/tts.getOrGenerateAudio
    ↓
Backend (server/src/routers/tts.ts)
    ├→ Check cache (TtsAudio table)
    ├→ If miss: Call ElevenLabs API
    └→ Store in cache
    ↓
Return audio URL (data:audio/mpeg;base64,...)
    ↓
Frontend: Play via HTML5 Audio element
```

## 🔍 Troubleshooting

### Audio not generating?
1. ✅ Check `ELEVENLABS_API_KEY` is set in server env
2. ✅ Verify API key is valid at elevenlabs.io/account/api-keys
3. ✅ Check browser console for error messages
4. ✅ Check server logs for "[TTS]" messages

### Slow audio generation?
- First request takes 2-5 seconds (normal - generating speech)
- Subsequent requests are instant (cached)
- Consider increasing `PREFETCH_AHEAD` in the hook to pre-fetch more paragraphs

### CORS errors?
- Ensure `VITE_API_URL` is configured if backend is on different origin
- Frontend will proxy requests to `/trpc` endpoint

## 📝 Files Modified/Created

**Created:**
- `server/src/routers/tts.ts` - TTS tRPC router
- `ELEVENLABS_SETUP.md` - Full documentation
- `.env.elevenlabs.example` - Environment template

**Modified:**
- `server/src/routers/_app.ts` - Added tts router
- `src/hooks/usePremiumTTS.ts` - Implemented API calls

## 💰 Cost Estimates

**ElevenLabs Pricing:**
- **Free:** 10,000 characters/month (~50 min audio)
- **Starter:** $5/month, 100k characters
- **Professional:** $99/month, unlimited

[See pricing →](https://elevenlabs.io/pricing)

## 🛠️ Next Steps

1. ✅ Add `ELEVENLABS_API_KEY` to environment
2. ✅ Restart server
3. ✅ Test TTS playback
4. ✅ Monitor usage at https://elevenlabs.io/account
5. ✅ Optional: Adjust voice, stability, or other parameters

## 📚 References

- [ElevenLabs Docs](https://elevenlabs.io/docs)
- [API Reference](https://elevenlabs.io/docs/api/reference)
- [Voice Cloning](https://elevenlabs.io/docs/features/voice-cloning)

---

**Status:** ✅ Ready to use - just add API key and restart!
