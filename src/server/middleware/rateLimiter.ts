import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import dotenv from 'dotenv';

dotenv.config();

const {
  RATE_LIMIT_WINDOW_MS = 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS = 300, // 300 requests per window
} = process.env;

/**
 * Rate limiter configuration
 * Limits requests based on IP address
 */
const rateLimiter = new RateLimiterMemory({
  points: Number(RATE_LIMIT_MAX_REQUESTS),
  duration: Number(RATE_LIMIT_WINDOW_MS) / 1000, // Convert to seconds
});

/**
 * Rate limiting middleware
 * Tracks and limits requests based on IP address
 */
export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Use a default IP if none is found
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    await rateLimiter.consume(clientIp);
    next();
  } catch (error) {
    if (error instanceof Error) {
      console.error('Rate limit error:', error);
    }
    
    // Calculate retry after time
    const retryAfter = Math.ceil(
      Number(RATE_LIMIT_WINDOW_MS) / 1000
    );

    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      retryAfter,
    });
  }
};

/**
 * Get current rate limit status for an IP
 */
export const getRateLimitStatus = async (ip: string): Promise<{
  remaining: number;
  reset: number;
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
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return {
      remaining: 0,
      reset: Number(RATE_LIMIT_WINDOW_MS) / 1000,
    };
  }
};
