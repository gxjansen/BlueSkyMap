import { AUTH_API, BSKY_API, RATE_LIMIT, validateConfig, BSKY_IDENTIFIER, BSKY_APP_PASSWORD } from './config';
import { RateLimiter } from './rateLimiter';
import { BskyProfile, BskyFollower } from './interfaces';

interface AuthResponse {
  accessJwt: string;
  refreshJwt: string;
  did: string;
  handle: string;
}

interface ApiRequestParams {
  [key: string]: string | number | boolean;
}

/**
 * Base AT Protocol Service
 * Handles core authentication and API request logic
 */
export class BaseATProtoService {
  protected accessJwt: string | null = null;
  protected refreshJwt: string | null = null;
  protected initialized: boolean = false;
  protected rateLimiter: RateLimiter;

  constructor() {
    validateConfig();
    this.rateLimiter = new RateLimiter(RATE_LIMIT);
  }

  /**
   * Initialize the AT Protocol service with authentication
   */
  async initialize(
    identifier: string = BSKY_IDENTIFIER!, 
    appPassword: string = BSKY_APP_PASSWORD!
  ): Promise<void> {
    if (this.initialized && this.accessJwt) {
      return;
    }

    try {
      console.log('Starting AT Protocol service initialization...');

      // Force a delay before authentication attempt
      await this.rateLimiter.checkRateLimit(true);

      const response = await fetch(`${AUTH_API}/com.atproto.server.createSession`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier,
          password: appPassword,
        }),
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = (retryAfter ? parseInt(retryAfter) : 60) * 1000;
        console.log(`Rate limited during authentication, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        throw new Error('Rate limited during authentication');
      }

      const data = await response.json() as AuthResponse;

      if (!response.ok || !data.accessJwt || !data.refreshJwt) {
        throw new Error('Authentication failed');
      }

      this.accessJwt = data.accessJwt;
      this.refreshJwt = data.refreshJwt;
      this.initialized = true;
      this.rateLimiter.resetErrorCount();

      console.log('Successfully authenticated with BlueSky');

    } catch (error) {
      this.accessJwt = null;
      this.refreshJwt = null;
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Make an authenticated API request with enhanced rate limiting and retries
   */
  protected async apiRequest<T = any>(
    endpoint: string, 
    params: ApiRequestParams = {}, 
    retries = 3
  ): Promise<T> {
    if (!this.initialized || !this.accessJwt) {
      await this.initialize();
    }

    await this.rateLimiter.checkRateLimit();

    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');

    const url = `${BSKY_API}/xrpc/${endpoint}${queryString ? `?${queryString}` : ''}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessJwt}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 429) {
        if (retries > 0) {
          const waitTime = this.rateLimiter.handleRateLimitError({ response });
          
          console.log(`Rate limited, waiting ${Math.round(waitTime)}ms before retry`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.apiRequest(endpoint, params, retries - 1);
        }
        throw new Error('Rate limit exceeded and out of retries');
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API request failed: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as T;
      this.rateLimiter.resetErrorCount();
      return data;

    } catch (error) {
      if (retries > 0) {
        const waitTime = this.rateLimiter.handleRateLimitError(error);
        console.log(`Request failed, retrying in ${Math.round(waitTime)}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return this.apiRequest(endpoint, params, retries - 1);
      }
      throw error;
    }
  }

  /**
   * Format handle to ensure it includes .bsky.social if needed
   */
  protected formatHandle(handle: string): string {
    if (!handle.includes('.')) {
      return `${handle}.bsky.social`;
    }
    return handle;
  }

  /**
   * Check if the service is authenticated
   */
  isAuthenticated(): boolean {
    return this.initialized && !!this.accessJwt;
  }
}
