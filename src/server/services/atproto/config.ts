import dotenv from 'dotenv';
import { RateLimitConfig } from './interfaces';

dotenv.config();

export const {
  BSKY_IDENTIFIER,
  BSKY_APP_PASSWORD,
} = process.env;

export const AUTH_API = 'https://bsky.social/xrpc';
export const BSKY_API = 'https://api.bsky.app';

// Strict rate limiting configuration aligned with Bluesky's limits
export const RATE_LIMIT: RateLimitConfig = {
  maxRequests: 80,  // Conservative limit (below Bluesky's 100/5min)
  timeWindow: 300 * 1000, // 5 minutes in milliseconds
  minWaitTime: 2000, // Minimum wait time between requests (2 seconds)
  backoffFactor: 1.5, // Exponential backoff factor
  maxBackoffTime: 60 * 1000, // Maximum backoff time (1 minute)
  jitterMax: 1000, // Maximum random jitter to add to delays
};

/**
 * Validate BlueSky API configuration
 * @throws {Error} If configuration is invalid
 */
export function validateConfig(): void {
  console.log('Validating AT Protocol configuration...');
  
  if (!BSKY_IDENTIFIER) {
    const error = 'BlueSky identifier not configured. Check BSKY_IDENTIFIER in .env';
    console.error(error);
    throw new Error(error);
  }
  
  if (!BSKY_APP_PASSWORD) {
    const error = 'BlueSky app password not configured. Check BSKY_APP_PASSWORD in .env';
    console.error(error);
    throw new Error(error);
  }
  
  if (BSKY_APP_PASSWORD === 'your-app-password') {
    const error = 'BlueSky app password is set to default value. Please update BSKY_APP_PASSWORD in .env';
    console.error(error);
    throw new Error(error);
  }
  
  console.log('AT Protocol configuration validated');
}
