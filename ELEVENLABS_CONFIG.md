# ElevenLabs Configuration Reference

## Environment Variables

### Required
```env
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Optional
```env
# Voice selection (default: 21m00Tcm4TlvDq8ikWAM - George)
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# API configuration
VITE_API_URL=http://localhost:3001
```

## Configuration Options in Code

### Backend (server/src/routers/tts.ts)

**Model Selection:**
```typescript
// Current setting: "eleven_turbo_v2" (fast, high quality)
model_id: "eleven_turbo_v2"

// Other options:
// - "eleven_monolingual_v1" - Faster, good for single language
// - "eleven_multilingual_v2" - Better multilingual support
```

**Voice Settings:**
```typescript
// Current settings (recommended defaults)
voice_settings: {
  stability: 0.5,        // Range: 0.0-1.0 (higher = more consistent)
  similarity_boost: 0.8, // Range: 0.0-1.0 (higher = more similar to voice)
}
```

**Cache Duration:**
```typescript
// Current: 30 days
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
```

### Frontend (src/hooks/usePremiumTTS.ts)

**Prefetch Ahead:**
```typescript
// How many paragraphs to pre-download ahead of current playback
const PREFETCH_AHEAD = 3; // Increase for faster perceived playback
```

**Text Limits:**
```typescript
// Maximum characters per API call
z.string().min(1).max(5000) // Adjust if needed
```

## Advanced Configuration

### Multilingual Support

To enable multilingual TTS:

1. **Update model:**
   ```typescript
   model_id: "eleven_multilingual_v2"
   ```

2. **Detect language in preprocessor:**
   ```typescript
   // Already detected via isBanglaText() in narrationPreprocessor.ts
   // Extend for other languages as needed
   ```

### Custom Voice Cloning

To use a cloned voice:

1. [Clone voice at ElevenLabs →](https://elevenlabs.io/app/voice-lab)
2. Copy the voice ID
3. Set `ELEVENLABS_VOICE_ID` to the cloned voice ID

```env
ELEVENLABS_VOICE_ID=your_cloned_voice_id
```

### Rate Limiting

ElevenLabs API has rate limits based on plan:

| Plan | Requests/min | Characters/month |
|------|--------------|------------------|
| Free | 2 | 10,000 |
| Starter | 30 | 100,000 |
| Professional | 100+ | Unlimited |

**Current implementation:** No retry logic (backend is simple)
To add retries, modify `server/src/routers/tts.ts`:

```typescript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // Exponential backoff
    }
  }
}
```

### Audio Format Options

Current: Base64 data URI for inline playback

**Alternative: Use signed S3 URLs**
```typescript
// Instead of base64, save to S3 and return URL
const audioUrl = await uploadToS3(audioBuffer);
await prisma.ttsAudio.create({
  data: {
    source_text: text,
    audio_url: audioUrl, // S3 URL instead of base64
    // ... other fields
  }
});
```

**Benefits:**
- Smaller response payloads
- Better streaming performance
- Easier to serve from CDN

## Monitoring & Analytics

### Check API Usage
```bash
# Via ElevenLabs dashboard
# https://elevenlabs.io/account/usage
```

### Database Query
```sql
-- Count cached audios
SELECT COUNT(*) FROM tts_audio WHERE status = 'completed';

-- Find most frequently used texts
SELECT source_text, COUNT(*) as times_used
FROM tts_audio
GROUP BY source_text
ORDER BY times_used DESC
LIMIT 10;

-- Cache size estimation
SELECT SUM(LENGTH(audio_url)) / (1024*1024) as size_mb FROM tts_audio;
```

### Server Logging
```typescript
// Already enabled - look for "[TTS]" prefix in logs
log("Fetching audio for:", text.slice(0, 50) + "...");
log("Prefetch ready:", i, url ? "✓" : "✗");
log("[TTS] Error:", error);
```

## Performance Tuning

### Reduce Latency
1. **Increase prefetch:**
   ```typescript
   const PREFETCH_AHEAD = 5; // Default: 3
   ```

2. **Enable fast model:**
   ```typescript
   model_id: "eleven_turbo_v2" // Already using
   ```

3. **Lower stability for speed:**
   ```typescript
   stability: 0.3 // Default: 0.5
   ```

### Reduce Storage
1. **Decrease cache duration:**
   ```typescript
   const thirtyDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
   ```

2. **Use S3 instead of database** (see Audio Format section)

3. **Compress audio (MP3 → OGG):**
   ```typescript
   // Convert audio format before storing
   // Requires ffmpeg or similar
   ```

## Troubleshooting

### API Quota Exceeded
**Error:** "Quota exceeded" from ElevenLabs

**Solution:**
1. Upgrade plan at https://elevenlabs.io/pricing
2. Clear old cache: `trpc.tts.clearOldCache.mutate({})`
3. Implement request debouncing

### Long Generation Times
**Cause:** API latency, text length, or high load

**Solutions:**
- Use shorter text chunks (< 500 characters)
- Use faster model: `eleven_monolingual_v1`
- Increase prefetch to mask latency
- Pre-generate common texts

### Memory Issues (Base64 Large)
**Cause:** Large base64 strings in database

**Solutions:**
1. **Use S3/Cloud Storage** instead of database
2. **Compress audio** before storing
3. **Stream audio** instead of loading full buffer
4. **Limit max text** length

```typescript
// Current limit
z.string().min(1).max(5000)

// Reduce to
z.string().min(1).max(1000)
```

## Production Checklist

- [ ] Set `ELEVENLABS_API_KEY` in production env
- [ ] Monitor API usage dashboard
- [ ] Set up error alerting
- [ ] Configure cache cleanup schedule
- [ ] Test with production text samples
- [ ] Set up CDN for audio URLs (if using S3)
- [ ] Document voice selection for team
- [ ] Plan storage growth (30+ MB/month typical)
- [ ] Configure backups for TtsAudio table
- [ ] Set rate limits for API calls

## Cost Analysis

**Example Costs (monthly):**

| Usage | Characters | Duration | ElevenLabs Cost |
|-------|-----------|----------|-----------------|
| Light (10 books) | 50,000 | ~4 hours | Free |
| Medium (50 books) | 250,000 | ~20 hours | $5-20 |
| Heavy (500 books) | 2,500,000 | ~200 hours | $99+ |

**Optimization Tips:**
- Cache aggressive (30 days)
- Reuse voices across books
- Batch process at off-peak times
- Monitor actual vs estimated usage

---

For questions, see [ELEVENLABS_SETUP.md](./ELEVENLABS_SETUP.md) or contact ElevenLabs support.
