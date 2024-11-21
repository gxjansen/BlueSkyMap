import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import dotenv from 'dotenv';

dotenv.config();

// Align with Bluesky's rate limits: 100 requests per 5 minutes
const {
  RATE_LIMIT_WINDOW_MS = 300000, // 5 minutes (300,000ms)
  RATE_LIMIT_MAX_REQUESTS = 95, // Slightly under the 100 limit to provide safety margin
} = process.env;

/**
 * Rate limiter configuration
 * Limits requests based on IP address to comply with Bluesky's rate limits
 * Uses 95 requests per 5 minutes to provide a safety margin
 */
const rateLimiter = new RateLimiterMemory({
  points: Number(RATE_LIMIT_MAX_REQUESTS),
  duration: Number(RATE_LIMIT_WINDOW_MS) / 1000, // Convert to seconds
  blockDuration: 300, // Block for 5 minutes if limit exceeded
});

/**
 * Rate limiting middleware
 * Tracks and limits requests based on IP address
 * Implements exponential backoff when limits are reached
 */
export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Use a default IP if none is found
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    await rateLimiter.consume(clientIp);
    next();
  } catch (error) {
    if (error instanceof Error) {
      console.error('Rate limit error:', error);
    }
    
    // Get rate limit info for the IP
    const rateLimitInfo = await rateLimiter.get(clientIp);
    
    // Calculate retry after time with exponential backoff
    const baseRetryAfter = Math.ceil(
      Number(RATE_LIMIT_WINDOW_MS) / 1000
    );
    
    // Add exponential backoff if this IP has exceeded limits multiple times
    const consumedPoints = rateLimitInfo ? rateLimitInfo.consumedPoints : 0;
    const multiplier = Math.min(Math.pow(2, consumedPoints / Number(RATE_LIMIT_MAX_REQUESTS)), 4);
    const retryAfter = Math.ceil(baseRetryAfter * multiplier);

    res.set('Retry-After', String(retryAfter));
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please respect Bluesky\'s rate limits of 100 requests per 5 minutes.',
      retryAfter,
    });
  }
};

/**
 * Get current rate limit status for an IP
 * Useful for clients to track their current rate limit status
 */
export const getRateLimitStatus = async (ip: string): Promise<{
  remaining: number;
  reset: number;
  limit: number;
}> => {
  try {
    const rateLimitInfo = await rateLimiter.get(ip);
    
    return {
      remaining: rateLimitInfo ? 
        Math.max(0, Number(RATE_LIMIT_MAX_REQUESTS) - rateLimitInfo.consumedPoints) : 
        Number(RATE_LIMIT_MAX_REQUESTS),
      reset: rateLimitInfo ? 
        Math.ceil(rateLimitInfo.msBeforeNext / 1000) : 
        0,
      limit: Number(RATE_LIMIT_MAX_REQUESTS),
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return {
      remaining: 0,
      reset: Number(RATE_LIMIT_WINDOW_MS) / 1000,
      limit: Number(RATE_LIMIT_MAX_REQUESTS),
    };
  }
};
