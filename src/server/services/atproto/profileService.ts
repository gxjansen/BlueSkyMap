import { BaseATProtoService } from './baseService';
import { BskyProfile, BskyFollower } from './interfaces';

/**
 * Profile-related services for AT Protocol
 * Handles fetching followers, following, and profile information
 */
export class ProfileService extends BaseATProtoService {
  /**
   * Get followers for a given handle with pagination and rate limiting
   */
  async getFollowers(handle: string): Promise<BskyFollower[]> {
    try {
      const formattedHandle = this.formatHandle(handle);
      console.log(`Fetching followers for ${formattedHandle}`);

      const profile = await this.getProfile(formattedHandle);
      console.log('Profile follower count:', profile.followersCount);

      let allFollowers: BskyFollower[] = [];
      let cursor: string | undefined;
      const limit = 50; // Reduced from 100 to be more conservative

      do {
        const params = {
          actor: formattedHandle,
          limit: limit.toString(),
          ...(cursor ? { cursor } : {}),
        };

        const response = await this.apiRequest('app.bsky.graph.getFollowers', params);

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
        console.log(`Fetched ${allFollowers.length} of ${profile.followersCount} followers`);

        // Add a delay between pagination requests
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        }

      } while (cursor);

      return allFollowers;

    } catch (error) {
      console.error(`Failed to fetch followers for ${handle}:`, error);
      return [];
    }
  }

  /**
   * Get following list for a given handle with pagination and rate limiting
   */
  async getFollowing(handle: string): Promise<BskyFollower[]> {
    try {
      const formattedHandle = this.formatHandle(handle);
      console.log(`Fetching following for ${formattedHandle}`);

      const profile = await this.getProfile(formattedHandle);
      console.log('Profile following count:', profile.followsCount);

      let allFollowing: BskyFollower[] = [];
      let cursor: string | undefined;
      const limit = 50; // Reduced from 100 to be more conservative

      do {
        const params = {
          actor: formattedHandle,
          limit: limit.toString(),
          ...(cursor ? { cursor } : {}),
        };

        const response = await this.apiRequest('app.bsky.graph.getFollows', params);

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
        console.log(`Fetched ${allFollowing.length} of ${profile.followsCount} following`);

        // Add a delay between pagination requests
        if (cursor) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
        }

      } while (cursor);

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

      if (!response?.did) {
        throw new Error(`No DID found for handle: ${handle}`);
      }

      return response.did;
    } catch (error) {
      console.error(`Failed to resolve DID for ${handle}:`, error);
      throw error;
    }
  }
}
