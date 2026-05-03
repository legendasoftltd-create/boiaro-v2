# Migration Guide: Per-Paragraph TTS → Full Book Audio + S3

## What Changed?

### Old System (Per-Paragraph)
- Generated audio for each paragraph separately
- Stored base64-encoded audio in database
- Multiple TTS API calls per session
- Complex buffering logic

### New System (Full Book + S3)
- Generates entire book audio once
- Stores MP3 in AWS S3
- Single TTS API call per book (cached on repeat)
- Simple streaming playback

## Code Changes

### 1. Hook Usage

**Before:**
```typescript
const { play, pause, resume, stop, skipForward, skipBackward } = usePremiumTTS(bookId);

// Play takes text and internally splits into paragraphs
play(fullBookText);

// Properties about current paragraph
state.currentParagraphIndex;
state.totalParagraphs;
state.currentSegmentText;
state.isBuffering;  // Buffering between paragraphs
```

**After:**
```typescript
const { play, pause, resume, stop, skipForward, skipBackward, seekToTime, setSpeed } = usePremiumTTS(bookId);

// Play takes full text, sends to backend for full generation
play(fullBookText);

// Properties about continuous audio playback
state.currentTime;           // Seconds into audio
state.duration;              // Total duration
state.isGenerating;          // Generating TTS
state.isLoading;             // Loading from S3
state.playbackRate;          // Playback speed
```

### 2. Playback Controls

**Before:**
```typescript
// Skip by paragraph index
skipForward(3);   // Skip 3 paragraphs
skipBackward(2);  // Back 2 paragraphs

// Seek to paragraph
seekToIndex(5);   // Jump to paragraph 5
```

**After:**
```typescript
// Skip by seconds
skipForward(30);   // Skip 30 seconds
skipBackward(10);  // Back 10 seconds

// Seek to time
seekToTime(300);   // Jump to 5:00 (300 seconds)
```

### 3. Component Update Example

**Before:**
```tsx
function AudioPlayer({ content }) {
  const tts = usePremiumTTS("book-123");

  return (
    <div>
      <button onClick={() => tts.play(content)}>
        {tts.isPlaying ? "Pause" : "Play"}
      </button>
      
      {/* Progress by paragraph */}
      <p>{tts.currentParagraphIndex + 1} / {tts.totalParagraphs}</p>
      
      {/* Skip by paragraphs */}
      <button onClick={() => tts.skipForward()}>Skip Forward</button>
      <button onClick={() => tts.skipBackward()}>Skip Back</button>
      
      {/* Show current text */}
      <p>{tts.currentSegmentText}</p>
      
      {/* Show buffering state */}
      {tts.isBuffering && <p>Loading paragraph...</p>}
    </div>
  );
}
```

**After:**
```tsx
function AudioPlayer({ content }) {
  const tts = usePremiumTTS("book-123");

  return (
    <div>
      <button onClick={() => tts.play(content)}>
        {tts.isPlaying ? "Pause" : "Play"}
      </button>
      
      {/* Progress bar */}
      <input
        type="range"
        min="0"
        max={tts.duration}
        value={tts.currentTime}
        onChange={(e) => tts.seekToTime(Number(e.target.value))}
      />
      <p>{Math.floor(tts.currentTime)}s / {Math.floor(tts.duration)}s</p>
      
      {/* Skip by seconds */}
      <button onClick={() => tts.skipForward(30)}>+30s</button>
      <button onClick={() => tts.skipBackward(10)}>-10s</button>
      
      {/* Speed control (new!) */}
      <select value={tts.playbackRate} onChange={(e) => tts.setSpeed(Number(e.target.value))}>
        <option value={0.75}>0.75x</option>
        <option value={1}>1x</option>
        <option value={1.25}>1.25x</option>
        <option value={1.5}>1.5x</option>
      </select>
      
      {/* Show generating/loading state */}
      {tts.isGenerating && <p>Generating audio...</p>}
      {tts.isLoading && <p>Loading from server...</p>}
      {tts.error && <p style={{color: 'red'}}>Error: {tts.error}</p>}
    </div>
  );
}
```

### 4. Backend API Changes

**Old Endpoint (Removed):**
```typescript
POST /trpc/tts.getOrGenerateAudio
Input: { text, bookId }
Output: { audioUrl, cached }
// Called multiple times per session
```

**New Endpoints:**

```typescript
// Main endpoint - get or generate full book audio
POST /trpc/tts.getOrGenerateFullBookAudio
Input: { bookId, fullText }
Output: { audioUrl, cached, generatedAt }
// Called once per book (cached on repeat)

// Check if audio exists (optional)
GET /trpc/tts.getBookAudioUrl
Input: { bookId }
Output: { exists, audioUrl, generatedAt }

// Cleanup old cache
POST /trpc/tts.clearOldCache
Output: { success, deletedCount }
```

## Migration Checklist

- [ ] Update all components using `usePremiumTTS`
- [ ] Replace `skipForward(n)` with `skipForward(seconds)`
- [ ] Replace `seekToIndex(n)` with `seekToTime(seconds)`
- [ ] Replace paragraph-based UI with time-based UI
- [ ] Update progress display from "Paragraph X/Y" to "Time HH:MM:SS"
- [ ] Test with AWS S3 configured
- [ ] Test fallback to local storage (if S3 fails)
- [ ] Monitor TtsAudio table size
- [ ] Setup cache cleanup job

## Step-by-Step Migration

### Step 1: Verify S3 Configuration
```bash
# Check if S3 is configured
curl http://localhost:3001/api/v1/admin/s3-status

# Response should show:
# { "configured": true, "bucket": "your-bucket", "circuitState": "closed" }
```

### Step 2: Update Environment Variables
```env
# Ensure these are set
ELEVENLABS_API_KEY=sk_your_key
AWS_S3_BUCKET=your-bucket
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

### Step 3: Deploy Backend Changes
```bash
cd server
npm run build
npm start
```

### Step 4: Deploy Frontend Changes
```bash
npm run build
npm start
```

### Step 5: Test Playback
- Open an audiobook
- Click "Play"
- First time: Should show "Generating audio..." for 2-5 minutes
- Subsequent times: Should play immediately from cache
- Check browser console for `[PremiumTTS]` logs

### Step 6: Verify S3 Storage
```bash
# List uploaded audio files
aws s3 ls s3://your-bucket/tts-books/

# Should see: book_*.mp3 files
```

## Rollback Plan

If issues occur:

1. **Disable TTS temporarily:**
   ```typescript
   // In hook, return error state
   if (process.env.TTS_DISABLED) {
     return { error: "TTS is temporarily disabled" };
   }
   ```

2. **Revert to old system:**
   - Restore previous backend code
   - Revert frontend hook changes
   - Keep database (TtsAudio table is still used)

3. **Check logs:**
   ```bash
   # Backend logs
   grep "TTS\|S3" server.log | tail -100
   
   # Browser console
   # Look for [PremiumTTS] and [TTS] prefixed messages
   ```

## Performance Monitoring

### Key Metrics to Track

1. **Generation Time**
   ```sql
   SELECT bookId, 
          COUNT(*) as plays,
          MAX(createdAt) as lastGenerated
   FROM ttsAudio
   GROUP BY bookId
   ORDER BY plays DESC;
   ```

2. **S3 Upload Success Rate**
   ```
   Check application logs for [s3] circuit breaker state
   Monitor: uploads via S3 vs local fallback
   ```

3. **API Cost**
   - Track TTS generations (not plays)
   - Measure: generations_per_month * $0.03

4. **Storage Cost**
   ```
   SELECT SUM(LENGTH(audio_url)) / (1024*1024*1024) as total_gb
   FROM ttsAudio;
   ```

## Common Issues During Migration

### Issue: "ELEVENLABS_API_KEY not configured"
- Verify `.env` has `ELEVENLABS_API_KEY`
- Restart server
- Check: `echo $ELEVENLABS_API_KEY`

### Issue: S3 upload fails, using local fallback
- Expected behavior - circuit breaker is working
- Check AWS credentials in `.env`
- Verify S3 bucket exists and is accessible
- Monitor: Files should sync to S3 when it recovers

### Issue: Playback doesn't start
- Check browser console for errors
- Verify CORS is enabled on S3 bucket
- Test: Can you access the S3 URL directly in browser?

### Issue: Audio sounds wrong/garbled
- Check `ELEVENLABS_VOICE_ID` is valid
- Try different voice: `21m00Tcm4TlvDq8ikWAM` (George)
- Verify text encoding (should support Bangla)

## Questions?

Refer to:
- [TTS_S3_ARCHITECTURE.md](./TTS_S3_ARCHITECTURE.md) - Full architecture docs
- [ELEVENLABS_CONFIG.md](./ELEVENLABS_CONFIG.md) - Configuration options
- [server/src/routers/tts.ts](./server/src/routers/tts.ts) - Backend implementation
- [src/hooks/usePremiumTTS.ts](./src/hooks/usePremiumTTS.ts) - Frontend implementation
