# ElevenLabs TTS Integration

This project uses **ElevenLabs** for premium text-to-speech functionality.

## Setup

### 1. Environment Variables

Add these to your `.env` files:

#### Server (`.env` or `server/.env`)
```env
# ElevenLabs API Configuration
ELEVENLABS_API_KEY=your_api_key_here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

#### Frontend (`.env` in root)
```env
# API configuration (if backend is on a different origin)
VITE_API_URL=http://localhost:3001
```

### 2. Get ElevenLabs Credentials

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Navigate to **Account → API Key**
3. Copy your API key
4. Choose a **Voice ID** from [elevenlabs.io/docs/voices](https://elevenlabs.io/docs/voices)

### 3. Available Voice IDs

Some popular ElevenLabs voices:

- **21m00Tcm4TlvDq8ikWAM** - George (Default) - Professional, neutral
- **EXAVITQu4vr4xnSDxMaL** - Bella - Warm, friendly
- **TxGEqnHWrfWFTfGW9XjX** - Chris - Calm, measured
- **VR6AewLVLomS5PPF0QU5** - Elli - Young, energetic
- **pNInz6obpgDQGcFmaJgB** - Adam - Deep, authoritative

[Browse all voices →](https://elevenlabs.io/docs/voices)

### 4. Database Migration

The `TtsAudio` table is already included in the schema:

```prisma
model TtsAudio {
  id         String   @id @default(cuid())
  textHash   String   @unique
  text       String   @db.Text
  audioUrl   String   @db.Text
  bookId     String?
  durationMs Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  
  @@map("tts_audio")
}
```

No additional migrations needed - it's already set up.

## Architecture

### Frontend Flow
1. [usePremiumTTS.ts](../../src/hooks/usePremiumTTS.ts) - React hook for audio playback
2. Calls backend TTS router via tRPC
3. Receives audio URL (data URI or blob)
4. Plays audio using HTML5 Audio element

### Backend Flow
1. [server/src/routers/tts.ts](../../server/src/routers/tts.ts) - tRPC procedures
2. `getOrGenerateAudio` - Query cached audio or generate new
3. Calls ElevenLabs API if cache miss
4. Stores result in `TtsAudio` table
5. Returns base64-encoded audio URL

### Caching Strategy
- Audio is hashed by SHA-256 of normalized text
- Cached for 30 days (configurable)
- Old cache auto-cleaned via `clearOldCache` mutation

## API Endpoints

### tRPC Procedures

#### `tts.getOrGenerateAudio`
**Query** - Get or generate audio for text

```typescript
trpc.tts.getOrGenerateAudio.query({
  text: "Hello world",
  bookId: "optional-book-id"
})
```

**Response:**
```typescript
{
  audioUrl: "data:audio/mpeg;base64,...",
  cached: true,
  success: true
}
```

#### `tts.generateAudio`
**Mutation** - Force generate new audio (ignores cache)

```typescript
trpc.tts.generateAudio.mutate({
  text: "Hello world",
  bookId: "optional-book-id"
})
```

#### `tts.clearOldCache`
**Mutation** - Delete audio older than 30 days

```typescript
trpc.tts.clearOldCache.mutate({})
```

## Pricing & Limits

### ElevenLabs Free Tier
- 10,000 characters/month (~50 minutes of audio)
- Limited voices
- Standard latency

### ElevenLabs Pro
- Unlimited characters
- All voices
- Priority API access
- $5-99/month depending on usage

[See pricing →](https://elevenlabs.io/pricing)

## Troubleshooting

### "ELEVENLABS_API_KEY not configured"
- ✅ Add `ELEVENLABS_API_KEY` to server `.env`
- ✅ Restart server after adding env var
- ✅ Check key is valid at elevenlabs.io/account/api-keys

### Audio plays but sounds wrong
- ✅ Check `ELEVENLABS_VOICE_ID` exists
- ✅ Try a different voice ID
- ✅ Verify text encoding (Bangla characters should work)

### Slow audio generation
- ✅ First-time generation takes 2-5 seconds
- ✅ Cached audio loads instantly
- ✅ Consider increasing `PREFETCH_AHEAD` in hook

### Error in browser console
- ✅ Check browser DevTools Network tab for failed requests
- ✅ Verify server is running and accessible
- ✅ Check ElevenLabs API quota at elevenlabs.io/account

## Development

### Mock Mode
For testing without API calls, edit [src/pages/TtsDemo.tsx](../../src/pages/TtsDemo.tsx):

```typescript
// Mock mode for testing UI without real API
const mockMode = true; // Set to false for real TTS
```

### Logging
Debug logs are prefixed with `[PremiumTTS]` and `[TTS]`. Monitor in browser console or server logs.

## Files

- **Frontend Hook:** [src/hooks/usePremiumTTS.ts](../../src/hooks/usePremiumTTS.ts)
- **Backend Router:** [server/src/routers/tts.ts](../../server/src/routers/tts.ts)
- **Database Schema:** [server/prisma/schema.prisma](../../server/prisma/schema.prisma#L1422)
- **Demo Component:** [src/pages/TtsDemo.tsx](../../src/pages/TtsDemo.tsx)

## References

- [ElevenLabs API Docs](https://elevenlabs.io/docs/api)
- [ElevenLabs Models](https://elevenlabs.io/docs/models)
- [Voice Cloning](https://elevenlabs.io/docs/features/voice-cloning)
