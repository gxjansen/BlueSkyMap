import dotenv from 'dotenv';

dotenv.config();

const {
  BSKY_IDENTIFIER,
  BSKY_APP_PASSWORD,
} = process.env;

const AUTH_API = 'https://bsky.social/xrpc';
const BSKY_API = 'https://api.bsky.app';

interface BskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  followersCount: number;
  followsCount: number;
  followingCount: number; // Alias for followsCount
  postsCount: number;
  indexedAt: string;
}

interface BskyFollower {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followersCount: number;
  followsCount: number;
  followingCount: number; // Alias for followsCount
  postsCount: number;
}

/**
 * AT Protocol Service
 * Handles interactions with the BlueSky social network using direct API calls
 */
class ATProtoService {
  private accessJwt: string | null = null;
  private refreshJwt: string | null = null;
  private initialized: boolean = false;

  constructor() {
    console.log('Initializing AT Protocol service with config:', {
      identifier: BSKY_IDENTIFIER,
      hasPassword: !!BSKY_APP_PASSWORD
    });
  }

  /**
   * Initialize the AT Protocol service and authenticate
   */
  async initialize(): Promise<void> {
    if (this.initialized && this.accessJwt) {
      console.log('AT Protocol service already initialized');
      return;
    }

    try {
      if (!BSKY_IDENTIFIER || !BSKY_APP_PASSWORD) {
        throw new Error('BlueSky credentials not configured. Check BSKY_IDENTIFIER and BSKY_APP_PASSWORD in .env');
      }

      console.log('Attempting to login with identifier:', BSKY_IDENTIFIER);

      // Authenticate with BlueSky
      const response = await fetch(`${AUTH_API}/com.atproto.server.createSession`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: BSKY_IDENTIFIER,
          password: BSKY_APP_PASSWORD,
        }),
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('Authentication response:', data);

      if (!data.accessJwt || !data.refreshJwt) {
        throw new Error('Authentication successful but missing JWT tokens');
      }

      this.accessJwt = data.accessJwt;
      this.refreshJwt = data.refreshJwt;
      this.initialized = true;

      console.log('Successfully authenticated with BlueSky');

      // Test profile fetch immediately after authentication
      const testHandle = 'gui.do';
      console.log(`Testing profile fetch for ${testHandle}`);
      const profile = await this.getProfile(testHandle);
      console.log('Test profile fetch result:', {
        handle: profile.handle,
        displayName: profile.displayName,
        followersCount: profile.followersCount,
        followsCount: profile.followsCount,
      });

    } catch (error) {
      console.error('Failed to authenticate with BlueSky:', error);
      this.accessJwt = null;
      this.refreshJwt = null;
      this.initialized = false;
      throw error;
    }
  }

  /**
   * Make an authenticated API request
   */
  private async apiRequest(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.initialized || !this.accessJwt) {
      await this.initialize();
    }

    const queryString = Object.entries(params)
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    const url = `${BSKY_API}/xrpc/${endpoint}${queryString ? `?${queryString}` : ''}`;
    console.log(`Making API request to: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessJwt}`,
        'Accept': 'application/json',
      },
    });

    const responseText = await response.text();
    console.log('Raw API response:', responseText);

    if (!response.ok) {
      console.error('API request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: responseText,
        url,
        headers: Object.fromEntries(response.headers.entries()),
      });
      throw new Error(`API request failed: ${response.statusText} - ${responseText}`);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse API response:', error);
      throw new Error(`Failed to parse API response: ${responseText}`);
    }

    console.log('Parsed API response:', {
      endpoint,
      params,
      data,
    });

    return data;
  }

  /**
   * Format handle to ensure it includes .bsky.social if needed
   */
  private formatHandle(handle: string): string {
    if (!handle.includes('.')) {
      return `${handle}.bsky.social`;
    }
    return handle;
  }

  /**
   * Get followers for a given handle with pagination
   */
  async getFollowers(handle: string): Promise<BskyFollower[]> {
    try {
      const formattedHandle = this.formatHandle(handle);
      console.log(`Fetching followers for ${formattedHandle}`);

      // First get the profile to verify follower count
      const profile = await this.getProfile(formattedHandle);
      console.log('Profile follower count:', profile.followersCount);

      let allFollowers: BskyFollower[] = [];
      let cursor: string | undefined;
      const limit = 100;

      do {
        const params = {
          actor: formattedHandle,
          limit: limit.toString(),
          ...(cursor ? { cursor } : {}),
        };

        const response = await this.apiRequest('app.bsky.graph.getFollowers', params);
        console.log('Followers response:', {
          handle: formattedHandle,
          params,
          response,
        });

        if (response?.followers) {
          const followers = response.followers.map((f: any) => ({
            did: f.did,
            handle: f.handle,
            displayName: f.displayName,
            avatar: f.avatar,
            followersCount: f.followersCount || 0,
            followsCount: f.followsCount || 0,
            followingCount: f.followsCount || 0,
            postsCount: f.postsCount || 0,
          }));
          allFollowers = allFollowers.concat(followers);
        }

        cursor = response?.cursor;
        
        // Log progress
        console.log(`Fetched ${allFollowers.length} of ${profile.followersCount} followers`);

        // Rate limiting
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } while (cursor);

      console.log(`Total followers fetched: ${allFollowers.length}`);
      if (allFollowers.length > 0) {
        console.log('Sample follower data:', allFollowers[0]);
      }
      return allFollowers;

    } catch (error) {
      console.error(`Failed to fetch followers for ${handle}:`, error);
      return [];
    }
  }

  /**
   * Get following list for a given handle with pagination
   */
  async getFollowing(handle: string): Promise<BskyFollower[]> {
    try {
      const formattedHandle = this.formatHandle(handle);
      console.log(`Fetching following for ${formattedHandle}`);

      // First get the profile to verify following count
      const profile = await this.getProfile(formattedHandle);
      console.log('Profile following count:', profile.followsCount);

      let allFollowing: BskyFollower[] = [];
      let cursor: string | undefined;
      const limit = 100;

      do {
        const params = {
          actor: formattedHandle,
          limit: limit.toString(),
          ...(cursor ? { cursor } : {}),
        };

        const response = await this.apiRequest('app.bsky.graph.getFollows', params);
        console.log('Following response:', {
          handle: formattedHandle,
          params,
          response,
        });

        if (response?.follows) {
          const following = response.follows.map((f: any) => ({
            did: f.did,
            handle: f.handle,
            displayName: f.displayName,
            avatar: f.avatar,
            followersCount: f.followersCount || 0,
            followsCount: f.followsCount || 0,
            followingCount: f.followsCount || 0,
            postsCount: f.postsCount || 0,
          }));
          allFollowing = allFollowing.concat(following);
        }

        cursor = response?.cursor;

        // Log progress
        console.log(`Fetched ${allFollowing.length} of ${profile.followsCount} following`);

        // Rate limiting
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } while (cursor);

      console.log(`Total following fetched: ${allFollowing.length}`);
      if (allFollowing.length > 0) {
        console.log('Sample following data:', allFollowing[0]);
      }
      return allFollowing;

    } catch (error) {
      console.error(`Failed to fetch following for ${handle}:`, error);
      return [];
    }
  }

  /**
   * Get profile information for a given handle
   */
  async getProfile(handle: string): Promise<BskyProfile> {
    try {
      const formattedHandle = this.formatHandle(handle);
      console.log(`Fetching profile for ${formattedHandle}`);

      const response = await this.apiRequest('app.bsky.actor.getProfile', {
        actor: formattedHandle,
      });

      console.log('Profile response:', {
        handle: formattedHandle,
        response,
      });

      return {
        did: response.did,
        handle: response.handle,
        displayName: response.displayName,
        followersCount: response.followersCount,
        followsCount: response.followsCount,
        followingCount: response.followsCount,
        postsCount: response.postsCount,
        indexedAt: response.indexedAt,
      };

    } catch (error) {
      console.error(`Failed to fetch profile for ${handle}:`, error);
      throw error;
    }
  }

  /**
   * Resolve handle to DID
   */
  async resolveDid(handle: string): Promise<string> {
    try {
      const formattedHandle = this.formatHandle(handle);
      console.log(`Resolving DID for ${formattedHandle}`);

      const response = await this.apiRequest('com.atproto.identity.resolveHandle', {
        handle: formattedHandle,
      });

      console.log('Resolve handle response:', {
        handle: formattedHandle,
        response,
      });

      if (!response?.did) {
        throw new Error(`No DID found for handle: ${handle}`);
      }

      return response.did;
    } catch (error) {
      console.error(`Failed to resolve DID for ${handle}:`, error);
      throw error;
    }
  }

  /**
   * Check if the service is authenticated
   */
  isAuthenticated(): boolean {
    return this.initialized && !!this.accessJwt;
  }
}

// Create and export singleton instance
const atprotoService = new ATProtoService();
export default atprotoService;
