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
  NetworkAnalysisDocument
} from '../models/Cache';
import atprotoService from './atproto';

class CacheService {
  /**
   * Get user profile with caching
   */
  async getUserProfile(
    handle: string,
    options: CacheOptions = { duration: CACHE_DURATIONS.SHORT_TERM }
  ): Promise<UserProfile> {
    // Check cache first
    const cached = await UserProfileCache.findOne({ handle });
    if (cached && !options.force && isCacheValid(cached.lastUpdated, options.duration)) {
      return cached.data;
    }

    // Fetch fresh data
    const profile = await atprotoService.getProfile(handle);
    
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

    return profile;
  }

  /**
   * Get user connections with caching
   */
  async getUserConnections(
    handle: string,
    type: 'follower' | 'following',
    options: CacheOptions = { duration: CACHE_DURATIONS.SHORT_TERM }
  ): Promise<ConnectionData[]> {
    const userId = await this.resolveHandleToDid(handle);
    
    // Check cache first
    const cached = await ConnectionCache.find({
      userId,
      'connectionData.type': type,
    }).sort({ lastUpdated: -1 });

    if (cached.length > 0 && !options.force && 
        isCacheValid(cached[0].lastUpdated, options.duration)) {
      return cached.map(c => c.connectionData);
    }

    // Fetch fresh data
    const connections = type === 'follower' 
      ? await atprotoService.getFollowers(handle)
      : await atprotoService.getFollowing(handle);

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
        avatar: connection.avatar,
        followersCount: 0, // We don't have this info from the connection
        followingCount: 0, // We don't have this info from the connection
        postsCount: 0, // We don't have this info from the connection
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

    return connectionData;
  }

  /**
   * Get mutual connections
   */
  async getMutualConnections(
    handle: string,
    options: CacheOptions = { duration: CACHE_DURATIONS.MEDIUM_TERM }
  ): Promise<ConnectionData[]> {
    const [followers, following] = await Promise.all([
      this.getUserConnections(handle, 'follower', options),
      this.getUserConnections(handle, 'following', options),
    ]);

    const mutuals = followers.filter(follower =>
      follower?.connectionId && following.some(follow => 
        follow?.connectionId && follow.connectionId === follower.connectionId
      )
    );

    return mutuals.map(mutual => ({
      ...mutual,
      type: 'mutual' as ConnectionType,
    }));
  }

  /**
   * Store network analysis result
   */
  async storeNetworkAnalysis(
    analysis: NetworkAnalysisResult,
    options: CacheOptions = { duration: CACHE_DURATIONS.LONG_TERM }
  ): Promise<NetworkAnalysisResult> {
    await NetworkAnalysis.findOneAndUpdate(
      { userId: analysis.userId },
      {
        ...analysis,
        lastUpdated: new Date(),
        expiresAt: createCacheExpiration(options.duration),
      },
      { upsert: true, new: true }
    );

    return analysis;
  }

  /**
   * Get network analysis from cache
   */
  async getNetworkAnalysis(
    handle: string,
    options: CacheOptions = { duration: CACHE_DURATIONS.LONG_TERM }
  ): Promise<NetworkAnalysisResult> {
    const userId = await this.resolveHandleToDid(handle);

    // Check cache first
    const cached = await NetworkAnalysis.findOne({ userId });
    if (cached && !options.force && isCacheValid(cached.lastUpdated, options.duration)) {
      return this.convertToAnalysisResult(cached);
    }

    // If not in cache or forced refresh, return basic structure
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
   * Resolve handle to DID with caching
   */
  private async resolveHandleToDid(handle: string): Promise<string> {
    const cached = await UserProfileCache.findOne({ handle });
    if (cached) {
      return cached._id;
    }

    const did = await atprotoService.resolveDid(handle);
    return did;
  }

  /**
   * Clean expired cache entries
   */
  async cleanExpiredCache(): Promise<void> {
    const now = new Date();
    await Promise.all([
      UserProfileCache.deleteMany({ expiresAt: { $lt: now } }),
      ConnectionCache.deleteMany({ expiresAt: { $lt: now } }),
      NetworkAnalysis.deleteMany({ expiresAt: { $lt: now } }),
    ]);
  }
}

// Create and export singleton instance
const cacheService = new CacheService();
export default cacheService;
