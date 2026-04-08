/**
 * Client-side retry queue for failed media operations.
 * Retries signed URL generation and playback failures with exponential backoff.
 */

interface RetryItem {
  id: string;
  type: "signed_url" | "playback";
  bookId: string;
  trackNumber?: number;
  contentType: "ebook" | "audiobook";
  attempts: number;
  maxAttempts: number;
  nextRetryAt: number;
  lastError?: string;
  createdAt: number;
}

type RetryHandler = (item: RetryItem) => Promise<boolean>;

class MediaRetryQueue {
  private queue: Map<string, RetryItem> = new Map();
  private handlers: Map<string, RetryHandler> = new Map();
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private processing = false;

  // Metrics
  private _metrics = {
    totalEnqueued: 0,
    totalRetried: 0,
    totalSucceeded: 0,
    totalFailed: 0,
  };

  get metrics() {
    return {
      ...this._metrics,
      pendingCount: this.queue.size,
      items: Array.from(this.queue.values()).map(({ id, type, bookId, attempts, maxAttempts, lastError }) => ({
        id, type, bookId, attempts, maxAttempts, lastError,
      })),
    };
  }

  registerHandler(type: "signed_url" | "playback", handler: RetryHandler) {
    this.handlers.set(type, handler);
  }

  enqueue(params: {
    type: "signed_url" | "playback";
    bookId: string;
    trackNumber?: number;
    contentType: "ebook" | "audiobook";
    error?: string;
  }) {
    const key = `${params.type}:${params.bookId}:${params.trackNumber ?? "all"}:${params.contentType}`;
    const existing = this.queue.get(key);

    if (existing && existing.attempts >= existing.maxAttempts) {
      return; // Already exhausted
    }

    if (existing) {
      existing.lastError = params.error;
      return; // Already queued
    }

    const item: RetryItem = {
      id: key,
      type: params.type,
      bookId: params.bookId,
      trackNumber: params.trackNumber,
      contentType: params.contentType,
      attempts: 0,
      maxAttempts: 3,
      nextRetryAt: Date.now() + 2000, // First retry in 2s
      lastError: params.error,
      createdAt: Date.now(),
    };

    this.queue.set(key, item);
    this._metrics.totalEnqueued++;
    this.scheduleProcessing();
  }

  private scheduleProcessing() {
    if (this.timerId) return;
    this.timerId = setTimeout(() => {
      this.timerId = null;
      this.processQueue();
    }, 2000);
  }

  private async processQueue() {
    if (this.processing || this.queue.size === 0) return;
    this.processing = true;

    const now = Date.now();
    const ready = Array.from(this.queue.values()).filter(
      (item) => item.nextRetryAt <= now && item.attempts < item.maxAttempts
    );

    for (const item of ready) {
      const handler = this.handlers.get(item.type);
      if (!handler) {
        this.queue.delete(item.id);
        continue;
      }

      item.attempts++;
      this._metrics.totalRetried++;

      try {
        const success = await handler(item);
        if (success) {
          this.queue.delete(item.id);
          this._metrics.totalSucceeded++;
        } else {
          this.applyBackoff(item);
        }
      } catch (err) {
        item.lastError = err instanceof Error ? err.message : "Unknown error";
        this.applyBackoff(item);
      }

      if (item.attempts >= item.maxAttempts && this.queue.has(item.id)) {
        this.queue.delete(item.id);
        this._metrics.totalFailed++;
      }
    }

    this.processing = false;

    if (this.queue.size > 0) {
      this.scheduleProcessing();
    }
  }

  private applyBackoff(item: RetryItem) {
    // Exponential backoff: 2s, 4s, 8s
    const delay = Math.min(2000 * Math.pow(2, item.attempts), 16000);
    item.nextRetryAt = Date.now() + delay;
  }

  clear() {
    this.queue.clear();
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}

/** Singleton retry queue */
export const mediaRetryQueue = new MediaRetryQueue();

// Expose to window for admin monitoring
if (typeof window !== "undefined") {
  (window as any).__mediaRetryQueue = () => mediaRetryQueue.metrics;
}
