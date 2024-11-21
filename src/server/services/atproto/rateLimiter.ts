import { RateLimitConfig } from './interfaces';

/**
 * Advanced Rate Limiter for managing API request frequency
 * Implements token bucket algorithm with exponential backoff
 */
export class RateLimiter {
  private requestQueue: number[] = [];
  private lastRequestTime: number = 0;
  private consecutiveErrors: number = 0;

  constructor(private config: RateLimitConfig) {}

  /**
   * Check and enforce rate limiting
   * @param forceDelay Force a delay even if rate limit not exceeded
   */
  async checkRateLimit(forceDelay: boolean = false): Promise<void> {
    const now = Date.now();
    
    // Remove old requests from queue
    this.requestQueue = this.requestQueue.filter(
      timestamp => now - timestamp < this.config.timeWindow
    );

    // Calculate base delay based on consecutive errors
    const baseDelay = Math.min(
      this.config.maxBackoffTime,
      this.config.minWaitTime * Math.pow(this.config.backoffFactor, this.consecutiveErrors)
    );

    // Add jitter to prevent thundering herd
    const jitter = Math.random() * this.config.jitterMax;
    const totalDelay = baseDelay + jitter;

    if (forceDelay || this.requestQueue.length >= this.config.maxRequests) {
      console.log(`Rate limit reached, waiting ${Math.round(totalDelay)}ms`);
      await new Promise(resolve => setTimeout(resolve, totalDelay));
      return this.checkRateLimit(false);
    }

    // Ensure minimum time between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.minWaitTime) {
      const waitTime = this.config.minWaitTime - timeSinceLastRequest + jitter;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.requestQueue.push(now);
    this.lastRequestTime = now;
  }

  /**
   * Handle rate limit errors and adjust backoff strategy
   * @param error The error encountered
   * @returns Recommended wait time
   */
  handleRateLimitError(error: any): number {
    this.consecutiveErrors++;
    
    // Extract retry-after header if available
    const retryAfter = error.response?.headers?.get('Retry-After');
    
    return retryAfter 
      ? parseInt(retryAfter) * 1000 
      : Math.min(
          this.config.maxBackoffTime,
          this.config.minWaitTime * Math.pow(this.config.backoffFactor, this.consecutiveErrors)
        );
  }

  /**
   * Reset consecutive error count on successful request
   */
  resetErrorCount(): void {
    this.consecutiveErrors = 0;
  }
}
