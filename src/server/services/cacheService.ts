import { 
  UserProfile, 
  ConnectionData, 
  NetworkAnalysisResult, 
  CacheOptions,
  ConnectionType
} from '../../shared/types';
import { 
  UserProfileCache,
  ConnectionCache,
  NetworkAnalysis,
  CACHE_DURATIONS,
  createCacheExpiration,
  isCacheValid,
  UserProfileCacheDocument,
  ConnectionCacheDocument,
  NetworkAnalysisDocument,
  GenericCache
} from '../models/Cache';
import atprotoService from './atproto/index';
import { requestQueue } from '../utils/requestQueue';
import { BskyProfile, BskyFollower } from './atproto/interfaces';

class CacheService {
  /**
   * Generic cache get method
   */
  async get<T>(key: string): Promise<T | null> {
    console.log(`[CacheService] Getting cache for key: ${key}`);
    const cached = await GenericCache.findOne({ _id: key });
    
    if (!cached) {
      console.log(`[CacheService] No cache found for ${key}`);
      return null;
    }

    const isValid = isCacheValid(cached.lastUpdated, cached.duration);
    console.log(`[CacheService] Cache found for ${key}`);
    console.log(`- Last updated: ${cached.lastUpdated}`);
    console.log(`- Valid: ${isValid}`);
    
    if (!isValid) {
      console.log(`[CacheService] Cache expired for ${key}`);
      return null;
    }

    return cached.data as T;
  }

  /**
   * Generic cache set method
   */
  async set<T>(
    key: string,
    data: T,
    options: CacheOptions = { duration: CACHE_DURATIONS.SHORT_TERM }
  ): Promise<void> {
    console.log(`[CacheService] Setting cache for key: ${key}`);
    console.log(`- Duration: ${options.duration}ms`);
    
    await GenericCache.findOneAndUpdate(
      { _id: key },
      {
        _id: key,
        data,
        lastUpdated: new Date(),
        expiresAt: createCacheExpiration(options.duration),
        duration: options.duration
      },
      { upsert: true }
    );
    
    console.log(`[CacheService] Cache updated for ${key}`);
  }

  /**
   * Get user profile with caching and rate limiting
   */
  async getUserProfile(
    handle: string,
    options: CacheOptions = { duration: CACHE_DURATIONS.SHORT_TERM }
  ): Promise<UserProfile> {
    console.log(`[CacheService] Getting user profile for ${handle}`);
    
    // Check cache first
    const cached = await UserProfileCache.findOne({ handle });
    const isValid = cached && !options.force && isCacheValid(cached.lastUpdated, options.duration);

    if (cached) {
      console.log(`[CacheService] Cache found for profile ${handle}`);
      console.log(`- Last updated: ${cached.lastUpdated}`);
      console.log(`- Valid: ${isValid}`);
      console.log(`- Force: ${options.force}`);
      
      if (isValid) {
        return cached.data;
      }
      console.log(`[CacheService] Cache invalid, fetching fresh data`);
    }

    // Fetch fresh data with rate limiting
    console.log(`[CacheService] Fetching fresh profile data for ${handle}`);
    const profile = await requestQueue.queueRequest(() => 
      atprotoService.getProfile(handle)
    ) as BskyProfile;
    
    // Update cache
    await UserProfileCache.findOneAndUpdate(
      { handle },
      {
        _id: profile.did,
        handle,
        data: profile,
        lastUpdated: new Date(),
        expiresAt: createCacheExpiration(options.duration),
      },
      { upsert: true, new: true }
    );
    
    console.log(`[CacheService] Profile cache updated for ${handle}`);

    return {
      did: profile.did,
      handle: profile.handle,
      displayName: profile.displayName || profile.handle,
      avatar: profile.avatar || '',
      followersCount: profile.followersCount,
      followingCount: profile.followsCount,
      postsCount: profile.postsCount,
      indexedAt: profile.indexedAt,
    };
  }

  /**
   * Get user connections with caching and rate limiting
   */
  async getUserConnections(
    handle: string,
    type: 'follower' | 'following',
    options: CacheOptions = { duration: CACHE_DURATIONS.SHORT_TERM }
  ): Promise<ConnectionData[]> {
    console.log(`[CacheService] Getting ${type}s for ${handle}`);
    
    const userId = await this.resolveHandleToDid(handle);
    
    // Check cache first
    const cached = await ConnectionCache.find({
      userId,
      'connectionData.type': type,
    }).sort({ lastUpdated: -1 });

    const isValid = cached.length > 0 && !options.force && 
                   isCacheValid(cached[0].lastUpdated, options.duration);

    if (cached.length > 0) {
      console.log(`[CacheService] Cache found for ${type}s of ${handle}`);
      console.log(`- Count: ${cached.length}`);
      console.log(`- Last updated: ${cached[0].lastUpdated}`);
      console.log(`- Valid: ${isValid}`);
      console.log(`- Force: ${options.force}`);
      
      if (isValid) {
        return cached.map(c => c.connectionData);
      }
      console.log(`[CacheService] Cache invalid, fetching fresh data`);
    }

    // Fetch fresh data with rate limiting
    console.log(`[CacheService] Fetching fresh ${type}s data for ${handle}`);
    const connections = await requestQueue.queueRequest(() =>
      type === 'follower' 
        ? atprotoService.getFollowers(handle)
        : atprotoService.getFollowing(handle)
    ) as BskyFollower[];

    console.log(`[CacheService] Fetched ${connections.length} ${type}s`);

    // Process and cache connections
    const connectionData: ConnectionData[] = [];
    for (const connection of connections) {
      if (!connection?.did) {
        console.log('Skipping connection without DID:', connection);
        continue;
      }

      const profile: UserProfile = {
        did: connection.did,
        handle: connection.handle,
        displayName: connection.displayName || connection.handle,
        avatar: connection.avatar || '',
        followersCount: connection.followersCount || 0,
        followingCount: connection.followingCount || 0,
        postsCount: connection.postsCount || 0,
        indexedAt: new Date().toISOString(),
      };

      const data: ConnectionData = {
        userId,
        connectionId: connection.did,
        type,
        profile,
      };

      // Update cache
      await ConnectionCache.findOneAndUpdate(
        { _id: `${userId}:${connection.did}` },
        {
          userId,
          connectionData: data,
          lastUpdated: new Date(),
          expiresAt: createCacheExpiration(options.duration),
        },
        { upsert: true, new: true }
      );

      connectionData.push(data);
    }

    console.log(`[CacheService] Updated cache for ${connectionData.length} ${type}s`);
    return connectionData;
  }

  /**
   * Get mutual connections with caching
   */
  async getMutualConnections(
    userId: string,
    options: CacheOptions = { duration: CACHE_DURATIONS.MEDIUM_TERM }
  ): Promise<NetworkAnalysisResult | null> {
    console.log(`[CacheService] Getting mutual connections for ${userId}`);
    
    const cached = await NetworkAnalysis.findOne({ userId });
    const isValid = cached && !options.force && isCacheValid(cached.lastUpdated, options.duration);

    if (cached) {
      console.log(`[CacheService] Cache found for mutual connections`);
      console.log(`- Last updated: ${cached.lastUpdated}`);
      console.log(`- Valid: ${isValid}`);
      console.log(`- Force: ${options.force}`);
      
      if (isValid) {
        return this.convertToAnalysisResult(cached);
      }
      console.log(`[CacheService] Cache invalid, returning null for fresh analysis`);
    } else {
      console.log(`[CacheService] No cached mutual connections found`);
    }
    
    return null;
  }

  /**
   * Store network analysis result
   */
  async storeNetworkAnalysis(
    analysis: NetworkAnalysisResult,
    options: CacheOptions = { duration: CACHE_DURATIONS.LONG_TERM }
  ): Promise<NetworkAnalysisResult> {
    console.log(`[CacheService] Storing network analysis for ${analysis.handle}`);
    console.log(`- Stats:`, analysis.stats);
    console.log(`- Communities: ${analysis.communities.length}`);
    
    await NetworkAnalysis.findOneAndUpdate(
      { userId: analysis.userId },
      {
        ...analysis,
        lastUpdated: new Date(),
        expiresAt: createCacheExpiration(options.duration),
      },
      { upsert: true, new: true }
    );
    
    console.log(`[CacheService] Network analysis stored successfully`);
    return analysis;
  }

  /**
   * Get network analysis from cache
   */
  async getNetworkAnalysis(
    handle: string,
    options: CacheOptions = { duration: CACHE_DURATIONS.LONG_TERM }
  ): Promise<NetworkAnalysisResult> {
    console.log(`[CacheService] Getting network analysis for ${handle}`);
    
    const userId = await this.resolveHandleToDid(handle);

    // Check cache first
    const cached = await NetworkAnalysis.findOne({ userId });
    const isValid = cached && !options.force && isCacheValid(cached.lastUpdated, options.duration);

    if (cached) {
      console.log(`[CacheService] Cache found for network analysis`);
      console.log(`- Last updated: ${cached.lastUpdated}`);
      console.log(`- Valid: ${isValid}`);
      console.log(`- Force: ${options.force}`);
      
      if (isValid) {
        return this.convertToAnalysisResult(cached);
      }
      console.log(`[CacheService] Cache invalid, returning empty analysis`);
    }

    // If not in cache or forced refresh, return basic structure
    console.log(`[CacheService] Returning empty network analysis for ${handle}`);
    return {
      userId,
      handle,
      stats: {
        followers: 0,
        following: 0,
        mutuals: 0,
      },
      communities: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Convert NetworkAnalysisDocument to NetworkAnalysisResult
   */
  private convertToAnalysisResult(doc: NetworkAnalysisDocument): NetworkAnalysisResult {
    return {
      userId: doc.userId,
      handle: doc.handle,
      stats: doc.stats,
      communities: doc.communities,
      lastUpdated: doc.lastUpdated.toISOString(),
    };
  }

  /**
   * Resolve handle to DID with caching and rate limiting
   */
  private async resolveHandleToDid(handle: string): Promise<string> {
    console.log(`[CacheService] Resolving handle to DID: ${handle}`);
    
    const cached = await UserProfileCache.findOne({ handle });
    if (cached) {
      console.log(`[CacheService] Found cached DID for ${handle}: ${cached._id}`);
      return cached._id;
    }

    // Fetch profile to get DID
    console.log(`[CacheService] Fetching profile to get DID for ${handle}`);
    const profile = await this.getUserProfile(handle);
    console.log(`[CacheService] Resolved ${handle} to DID: ${profile.did}`);
    return profile.did;
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache(): Promise<void> {
    console.log(`[CacheService] Cleaning expired cache entries`);
    const now = new Date();
    
    const [profiles, connections, analyses, generic] = await Promise.all([
      UserProfileCache.deleteMany({ expiresAt: { $lt: now } }),
      ConnectionCache.deleteMany({ expiresAt: { $lt: now } }),
      NetworkAnalysis.deleteMany({ expiresAt: { $lt: now } }),
      GenericCache.deleteMany({ expiresAt: { $lt: now } }),
    ]);
    
    console.log(`[CacheService] Cleaned expired cache entries:`);
    console.log(`- Profiles: ${profiles.deletedCount}`);
    console.log(`- Connections: ${connections.deletedCount}`);
    console.log(`- Analyses: ${analyses.deletedCount}`);
    console.log(`- Generic: ${generic.deletedCount}`);
  }
}

// Create and export singleton instance
const cacheService = new CacheService();
export default cacheService;
