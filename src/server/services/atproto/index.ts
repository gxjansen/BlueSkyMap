import { BskyAgent } from '@atproto/api';
import { BskyProfile, BskyFollower } from './interfaces';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Create BskyAgent instance
const agent = new BskyAgent({
  service: process.env.BSKY_SERVICE || 'https://bsky.social'
});

let isInitialized = false;

/**
 * Convert any value to a number, defaulting to 0 if invalid
 */
function toNumber(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * Validate AT Protocol configuration
 */
export function validateConfig(): void {
  console.log('[ATProto] Validating configuration');
  const handle = process.env.BSKY_IDENTIFIER;
  const password = process.env.BSKY_APP_PASSWORD;

  if (!handle || !password) {
    console.error('[ATProto] Missing Bluesky credentials in .env');
    throw new Error('Bluesky handle or app password not configured in .env');
  }

  console.log('[ATProto] Configuration valid');
  console.log(`- Service: ${process.env.BSKY_SERVICE || 'https://bsky.social'}`);
  console.log(`- Handle: ${handle}`);
}

/**
 * Initialize AT Protocol authentication
 */
export async function initialize(): Promise<void> {
  console.log('[ATProto] Initializing authentication');
  
  const handle = process.env.BSKY_IDENTIFIER;
  const password = process.env.BSKY_APP_PASSWORD;

  if (!handle || !password) {
    console.error('[ATProto] Missing Bluesky credentials');
    throw new Error('Bluesky handle or app password not configured in .env');
  }

  try {
    console.log(`[ATProto] Attempting to login as ${handle}`);
    const response = await agent.login({
      identifier: handle,
      password: password
    });
    
    console.log('[ATProto] Login successful');
    console.log(`- DID: ${response.data.did}`);
    console.log(`- Handle: ${response.data.handle}`);
    console.log(`- Email: ${response.data.email}`);
    
    isInitialized = true;
  } catch (error) {
    console.error('[ATProto] Authentication failed:', error);
    throw new Error('Failed to authenticate with Bluesky');
  }
}

/**
 * Check if the agent is authenticated
 */
export function isAuthenticated(): boolean {
  const hasSession = agent.session !== undefined;
  console.log(`[ATProto] Authentication check - Session exists: ${hasSession}`);
  return isInitialized && hasSession;
}

/**
 * Get user profile
 * @param handle User's handle
 */
export async function getProfile(handle: string): Promise<BskyProfile> {
  console.log(`[ATProto] Fetching profile for ${handle}`);
  
  try {
    // Ensure we're authenticated
    if (!isAuthenticated()) {
      console.log('[ATProto] Not authenticated, initializing...');
      await initialize();
    }

    // Fetch profile
    console.log(`[ATProto] Making API call to fetch profile for ${handle}`);
    const response = await agent.getProfile({ actor: handle });
    console.log(`[ATProto] Profile fetched successfully for ${handle}`);
    console.log('- Response:', response.data);

    return {
      did: response.data.did,
      handle: response.data.handle,
      displayName: response.data.displayName || response.data.handle,
      avatar: response.data.avatar || '',
      followersCount: toNumber(response.data.followersCount),
      followingCount: toNumber(response.data.followsCount),
      followsCount: toNumber(response.data.followsCount),
      postsCount: toNumber(response.data.postsCount),
      indexedAt: response.data.indexedAt || new Date().toISOString()
    };
  } catch (error) {
    console.error(`[ATProto] Error fetching profile for ${handle}:`, error);
    throw error;
  }
}

/**
 * Get user's followers with pagination
 * @param handle User's handle
 */
export async function getFollowers(handle: string): Promise<BskyFollower[]> {
  console.log(`[ATProto] Fetching followers for ${handle}`);
  
  try {
    // Ensure we're authenticated
    if (!isAuthenticated()) {
      console.log('[ATProto] Not authenticated, initializing...');
      await initialize();
    }

    const followers: BskyFollower[] = [];
    let cursor: string | undefined;

    // Fetch all followers with pagination
    do {
      console.log(`[ATProto] Making API call to fetch followers for ${handle}`);
      console.log(`- Cursor: ${cursor || 'initial'}`);
      
      const response = await agent.getFollowers({
        actor: handle,
        limit: 100,
        cursor
      });

      console.log(`[ATProto] Fetched ${response.data.followers.length} followers`);

      // Add followers to our list
      followers.push(...response.data.followers.map(follower => ({
        did: follower.did,
        handle: follower.handle,
        displayName: follower.displayName || follower.handle,
        avatar: follower.avatar || '',
        followersCount: toNumber(follower.followersCount),
        followingCount: toNumber(follower.followsCount),
        followsCount: toNumber(follower.followsCount),
        postsCount: toNumber(follower.postsCount)
      })));

      // Update cursor for next page
      cursor = response.data.cursor;
      console.log(`- Next cursor: ${cursor || 'none'}`);
      console.log(`- Total followers so far: ${followers.length}`);

    } while (cursor);

    console.log(`[ATProto] Completed fetching followers for ${handle}`);
    console.log(`- Total followers: ${followers.length}`);
    return followers;

  } catch (error) {
    console.error(`[ATProto] Error fetching followers for ${handle}:`, error);
    throw error;
  }
}

/**
 * Get users the handle is following with pagination
 * @param handle User's handle
 */
export async function getFollowing(handle: string): Promise<BskyFollower[]> {
  console.log(`[ATProto] Fetching following for ${handle}`);
  
  try {
    // Ensure we're authenticated
    if (!isAuthenticated()) {
      console.log('[ATProto] Not authenticated, initializing...');
      await initialize();
    }

    const following: BskyFollower[] = [];
    let cursor: string | undefined;

    // Fetch all following with pagination
    do {
      console.log(`[ATProto] Making API call to fetch following for ${handle}`);
      console.log(`- Cursor: ${cursor || 'initial'}`);
      
      const response = await agent.getFollows({
        actor: handle,
        limit: 100,
        cursor
      });

      console.log(`[ATProto] Fetched ${response.data.follows.length} following`);

      // Add following to our list
      following.push(...response.data.follows.map(follow => ({
        did: follow.did,
        handle: follow.handle,
        displayName: follow.displayName || follow.handle,
        avatar: follow.avatar || '',
        followersCount: toNumber(follow.followersCount),
        followingCount: toNumber(follow.followsCount),
        followsCount: toNumber(follow.followsCount),
        postsCount: toNumber(follow.postsCount)
      })));

      // Update cursor for next page
      cursor = response.data.cursor;
      console.log(`- Next cursor: ${cursor || 'none'}`);
      console.log(`- Total following so far: ${following.length}`);

    } while (cursor);

    console.log(`[ATProto] Completed fetching following for ${handle}`);
    console.log(`- Total following: ${following.length}`);
    return following;

  } catch (error) {
    console.error(`[ATProto] Error fetching following for ${handle}:`, error);
    throw error;
  }
}

export default {
  validateConfig,
  initialize,
  isAuthenticated,
  getProfile,
  getFollowers,
  getFollowing
};
