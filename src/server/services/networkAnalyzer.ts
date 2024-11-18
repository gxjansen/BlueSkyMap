import { JobDocument, JobType } from '../models/Job';
import cacheService from './cacheService';
import graphProcessor from './graphProcessor';
import { CACHE_DURATIONS } from '../models/Cache';
import { NetworkAnalysisResult, AnalysisProgress, NetworkData } from '../../shared/types';
import atprotoService from './atproto';

/**
 * Network Analysis Handler
 * Processes network analysis jobs and manages data collection
 */
class NetworkAnalyzer {
  /**
   * Process a network analysis job
   */
  processJob = async (job: JobDocument): Promise<NetworkAnalysisResult> => {
    console.log(`Starting network analysis for handle: ${job.handle}`);
    const { force } = job.data;
    const handle = job.handle;
    const updateProgress = job.updateProgress.bind(job);

    try {
      // Step 1: Verify AT Protocol authentication
      if (!atprotoService.isAuthenticated()) {
        console.log('AT Protocol service not authenticated, initializing...');
        await atprotoService.initialize();
      }
      console.log('AT Protocol service authenticated');

      // Step 2: Collect user profile
      await updateProgress({
        stage: 'collecting',
        current: 0,
        total: 4,
        message: 'Fetching user profile',
      });

      console.log(`Fetching profile for handle: ${handle}`);
      const profile = await atprotoService.getProfile(handle);
      console.log('Profile data:', JSON.stringify(profile, null, 2));

      if (!profile?.did) {
        throw new Error(`Failed to fetch profile for handle: ${handle}`);
      }

      // Log profile stats
      console.log('Profile stats:', {
        did: profile.did,
        handle: profile.handle,
        followersCount: profile.followersCount,
        followsCount: profile.followsCount
      });

      // Step 3: Collect followers
      await updateProgress({
        stage: 'collecting',
        current: 1,
        total: 4,
        message: 'Fetching followers',
      });

      console.log(`Fetching followers for ${handle}`);
      const followers = await atprotoService.getFollowers(handle);
      console.log(`Fetched ${followers.length} followers`);
      if (followers.length > 0) {
        console.log('First follower:', JSON.stringify(followers[0], null, 2));
      } else {
        console.log('No followers found');
      }

      // Step 4: Collect following
      await updateProgress({
        stage: 'collecting',
        current: 2,
        total: 4,
        message: 'Fetching following',
      });

      console.log(`Fetching following for ${handle}`);
      const following = await atprotoService.getFollowing(handle);
      console.log(`Fetched ${following.length} following`);
      if (following.length > 0) {
        console.log('First following:', JSON.stringify(following[0], null, 2));
      } else {
        console.log('No following found');
      }

      // Log connection counts
      console.log('Connection counts:', {
        totalFollowers: followers.length,
        totalFollowing: following.length
      });

      // Validate follower and following data
      const validFollowers = followers.filter(f => f?.did && f?.handle);
      const validFollowing = following.filter(f => f?.did && f?.handle);

      console.log('Valid connection counts:', {
        validFollowers: validFollowers.length,
        validFollowing: validFollowing.length
      });

      // Step 5: Process mutual connections
      await updateProgress({
        stage: 'analyzing',
        current: 3,
        total: 4,
        message: 'Analyzing mutual connections',
      });

      // Find mutual connections
      const mutuals = validFollowers.filter(follower => {
        return validFollowing.some(follow => follow.did === follower.did);
      });
      console.log(`Found ${mutuals.length} mutual connections`);

      // Step 6: Create network graph
      await updateProgress({
        stage: 'processing',
        current: 3.5,
        total: 4,
        message: 'Creating network graph',
        details: {
          processedNodes: validFollowers.length + validFollowing.length,
          processedEdges: 0,
          discoveredCommunities: 0
        }
      });

      // Transform data for graph processing
      const connectionData = {
        followers: validFollowers.map(f => ({
          userId: profile.did,
          connectionId: f.did,
          type: 'follower' as const,
          profile: {
            did: f.did,
            handle: f.handle,
            displayName: f.displayName || f.handle,
            avatar: f.avatar,
            followersCount: f.followersCount || 0,
            followingCount: f.followsCount || 0,
            postsCount: f.postsCount || 0,
            indexedAt: new Date().toISOString()
          }
        })),
        following: validFollowing.map(f => ({
          userId: profile.did,
          connectionId: f.did,
          type: 'following' as const,
          profile: {
            did: f.did,
            handle: f.handle,
            displayName: f.displayName || f.handle,
            avatar: f.avatar,
            followersCount: f.followersCount || 0,
            followingCount: f.followsCount || 0,
            postsCount: f.postsCount || 0,
            indexedAt: new Date().toISOString()
          }
        })),
        mutuals: mutuals.map(m => ({
          userId: profile.did,
          connectionId: m.did,
          type: 'mutual' as const,
          profile: {
            did: m.did,
            handle: m.handle,
            displayName: m.displayName || m.handle,
            avatar: m.avatar,
            followersCount: m.followersCount || 0,
            followingCount: m.followsCount || 0,
            postsCount: m.postsCount || 0,
            indexedAt: new Date().toISOString()
          }
        }))
      };

      console.log('Transformed connection data:', {
        followers: connectionData.followers.length,
        following: connectionData.following.length,
        mutuals: connectionData.mutuals.length
      });

      // Create network graph
      const networkGraph = graphProcessor.createGraph(
        profile.did,
        connectionData.followers,
        connectionData.following,
        connectionData.mutuals
      );

      console.log('Created network graph:', {
        nodes: networkGraph.nodes.length,
        edges: networkGraph.edges.length
      });

      // Step 7: Detect communities
      await updateProgress({
        stage: 'processing',
        current: 3.8,
        total: 4,
        message: 'Detecting communities',
        details: {
          processedNodes: networkGraph.nodes.length,
          processedEdges: networkGraph.edges.length,
          discoveredCommunities: 0
        }
      });

      const communities = graphProcessor.detectCommunities(networkGraph);
      console.log(`Detected ${communities.length} communities`);

      // Step 8: Create final analysis
      const analysis: NetworkAnalysisResult = {
        userId: profile.did,
        handle: handle,
        stats: {
          followers: validFollowers.length,
          following: validFollowing.length,
          mutuals: mutuals.length,
        },
        communities,
        lastUpdated: new Date().toISOString(),
      };

      console.log('Final analysis:', {
        userId: analysis.userId,
        handle: analysis.handle,
        stats: analysis.stats,
        communitiesCount: analysis.communities.length
      });

      // Store analysis in cache
      await cacheService.storeNetworkAnalysis(analysis, {
        duration: CACHE_DURATIONS.LONG_TERM,
        force: true,
      });

      // Update final progress
      await updateProgress({
        stage: 'processing',
        current: 4,
        total: 4,
        message: 'Analysis complete',
        details: {
          processedNodes: networkGraph.nodes.length,
          processedEdges: networkGraph.edges.length,
          discoveredCommunities: communities.length
        }
      });

      return analysis;

    } catch (error) {
      console.error(`Error processing network analysis for ${handle}:`, error);
      throw error;
    }
  };

  /**
   * Register the network analysis handler with the job processor
   */
  registerHandler(jobProcessor: any): void {
    console.log('Registering network analyzer handler');
    jobProcessor.registerHandler(JobType.NETWORK_ANALYSIS, this.processJob);
  }
}

// Create and export singleton instance
const networkAnalyzer = new NetworkAnalyzer();
export default networkAnalyzer;
