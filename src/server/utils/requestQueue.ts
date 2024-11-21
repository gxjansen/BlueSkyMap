/**
 * Request Queue Utility
 * Provides centralized rate limiting for API requests
 */

interface QueuedRequest {
  promise: Promise<any>;
  completed: boolean;
}

class RequestQueue {
  private requestQueue: QueuedRequest[] = [];
  private static instance: RequestQueue;

  // Rate limiting configuration
  private readonly maxConcurrentRequests = 2;
  private readonly minRequestDelay = 2000; // 2 seconds between requests
  private lastRequestTime = 0;

  private constructor() {}

  public static getInstance(): RequestQueue {
    if (!RequestQueue.instance) {
      RequestQueue.instance = new RequestQueue();
    }
    return RequestQueue.instance;
  }

  /**
   * Queue an API request with rate limiting
   * Ensures we don't exceed Bluesky's rate limits
   */
  public async queueRequest<T>(request: () => Promise<T>): Promise<T> {
    // Remove completed requests from queue
    this.requestQueue = this.requestQueue.filter(r => !r.completed);
    
    // Wait if we have too many concurrent requests
    while (this.requestQueue.filter(r => !r.completed).length >= this.maxConcurrentRequests) {
      await Promise.race(this.requestQueue.map(r => r.promise));
      this.requestQueue = this.requestQueue.filter(r => !r.completed);
    }

    // Ensure minimum time between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestDelay) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestDelay - timeSinceLastRequest)
      );
    }

    // Create new request with completion tracking
    const queuedRequest: QueuedRequest = {
      promise: request().finally(() => {
        queuedRequest.completed = true;
        this.lastRequestTime = Date.now();
      }),
      completed: false
    };

    this.requestQueue.push(queuedRequest);
    return queuedRequest.promise;
  }
}

// Export singleton instance
export const requestQueue = RequestQueue.getInstance();
