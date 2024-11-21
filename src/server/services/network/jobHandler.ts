import atprotoService, { 
  getProfile, 
  getFollowers, 
  getFollowing,
  isAuthenticated,
  initialize
} from '../atproto/index';
import { JobDocument, JobType, JobStatus } from '../../models/Job';
import { NetworkAnalysisResult, AnalysisProgress } from '../../../shared/types';
import { CACHE_DURATIONS } from '../../models/Cache';
import cacheService from '../cacheService';
import graphProcessor from '../graphProcessor';
import networkBuilder from './networkBuilder';
import progressTracker from './progressTracker';
import { requestQueue } from '../../utils/requestQueue';
import { BskyFollower, BskyProfile } from '../atproto/interfaces';

// Define an interface for the job processor to ensure type safety
export interface JobProcessor {
  registerHandler: (
    jobType: JobType, 
    handler: (job: JobDocument) => Promise<NetworkAnalysisResult>
  ) => void;
}

/**
 * NetworkAnalysisService
 * Manages the entire network analysis process with clear separation of concerns
 */
class NetworkAnalysisService {
  /**
   * Authenticate and initialize AT Protocol service
   * @private
   */
  private async initializeAtProtocol(): Promise<void> {
    console.log('[NetworkAnalysis] Initializing AT Protocol');
    if (!isAuthenticated()) {
      console.log('[NetworkAnalysis] AT Protocol service not authenticated, initializing...');
      await initialize();
    }
    console.log('[NetworkAnalysis] AT Protocol service authenticated');
  }

  /**
   * Fetch user profile with error handling
   * @param handle User's handle
   * @private
   */
  private async fetchUserProfile(handle: string): Promise<BskyProfile> {
    console.log(`[NetworkAnalysis] Fetching profile for handle: ${handle}`);
    try {
      const profile = await requestQueue.queueRequest(() => 
        getProfile(handle)
      ) as BskyProfile;

      if (!profile?.did) {
        console.error(`[NetworkAnalysis] Failed to fetch profile for handle: ${handle}`);
        throw new Error(`Failed to fetch profile for handle: ${handle}`);
      }

      console.log(`[NetworkAnalysis] Profile fetched successfully for handle: ${handle}, DID: ${profile.did}`);
      return profile;
    } catch (error) {
      console.error(`[NetworkAnalysis] Error fetching profile for ${handle}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve followers and following with rate limiting
   * @param handle User's handle
   * @private
   */
  private async fetchConnections(handle: string): Promise<{
    followers: BskyFollower[], 
    following: BskyFollower[]
  }> {
    console.log(`[NetworkAnalysis] Starting connection fetch for handle: ${handle}`);
    try {
      console.log(`[NetworkAnalysis] Queuing follower request for ${handle}`);
      const followersPromise = requestQueue.queueRequest(() => getFollowers(handle)) as Promise<BskyFollower[]>;
      
      console.log(`[NetworkAnalysis] Queuing following request for ${handle}`);
      const followingPromise = requestQueue.queueRequest(() => getFollowing(handle)) as Promise<BskyFollower[]>;
      
      const [followers, following] = await Promise.all([followersPromise, followingPromise]);

      console.log(`[NetworkAnalysis] Connection fetch complete for ${handle}:`);
      console.log(`- Followers: ${followers.length}`);
      console.log(`- Following: ${following.length}`);
      
      return { followers, following };
    } catch (error) {
      console.error(`[NetworkAnalysis] Error fetching connections for ${handle}:`, error);
      throw error;
    }
  }

  /**
   * Find mutual connections between followers and following
   * @param followers User's followers
   * @param following Users the user is following
   * @private
   */
  private findMutualConnections(
    followers: BskyFollower[], 
    following: BskyFollower[]
  ): BskyFollower[] {
    console.log(`[NetworkAnalysis] Starting mutual connection analysis`);
    console.log(`- Total followers: ${followers.length}`);
    console.log(`- Total following: ${following.length}`);

    const mutuals = followers.filter((follower: BskyFollower) =>
      following.some((follow: BskyFollower) => follow.did === follower.did)
    );

    console.log(`[NetworkAnalysis] Mutual connection analysis complete`);
    console.log(`- Found ${mutuals.length} mutual connections`);
    return mutuals;
  }

  /**
   * Prepare connection data for graph processing
   * @param profileDid Profile's DID
   * @param mutuals Mutual connections
   * @private
   */
  private prepareConnectionData(
    profileDid: string, 
    mutuals: BskyFollower[]
  ): any[] {
    console.log(`[NetworkAnalysis] Preparing connection data`);
    console.log(`- Profile DID: ${profileDid}`);
    console.log(`- Mutual connections: ${mutuals.length}`);

    const connectionData = mutuals.map((m: BskyFollower) => ({
      userId: profileDid,
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
    }));

    console.log(`[NetworkAnalysis] Connection data prepared: ${connectionData.length} entries`);
    return connectionData;
  }

  /**
   * Process network analysis job
   * @param job Job document to process
   */
  async processJob(job: JobDocument): Promise<NetworkAnalysisResult> {
    console.log(`[NetworkAnalysis] Starting job processing`);
    console.log(`- Job ID: ${job.id}`);
    console.log(`- Handle: ${job.handle}`);
    console.log(`- Force update: ${job.data.force}`);

    const { force } = job.data;
    const handle = job.handle;

    try {
      // Reset job to pending state to allow processing
      job.status = JobStatus.PENDING;
      await job.save();
      console.log(`[NetworkAnalysis] Job status set to PENDING`);

      // Step 1: Initialize AT Protocol
      console.log('[NetworkAnalysis] Step 1: Initializing AT Protocol');
      await this.initializeAtProtocol();
      await progressTracker.updateProgress(
        job.id.toString(),
        'initializing',
        0,
        4,
        'Starting network analysis',
        {
          processedNodes: 0,
          processedEdges: 0,
          discoveredCommunities: 0
        }
      );

      // Step 2: Fetch profile and check cache
      console.log('[NetworkAnalysis] Step 2: Profile and cache check');
      const profile = await this.fetchUserProfile(handle);
      const cachedMutuals = await cacheService.getMutualConnections(profile.did);
      
      if (cachedMutuals && !force) {
        console.log('[NetworkAnalysis] Using cached mutual connections');
        return cachedMutuals;
      }

      // Step 3: Fetch and process connections
      console.log('[NetworkAnalysis] Step 3: Connection processing');
      const { followers, following } = await this.fetchConnections(handle);
      const mutuals = this.findMutualConnections(followers, following);

      await progressTracker.updateProgress(
        job.id.toString(),
        'collecting',
        1,
        4,
        'Processing connections',
        {
          processedNodes: followers.length + following.length,
          processedEdges: 0,
          discoveredCommunities: 0
        }
      );

      // Step 4: Build network
      console.log('[NetworkAnalysis] Step 4: Network building');
      const network = await networkBuilder.buildCompleteNetwork(
        profile.did,
        handle,
        mutuals,
        (progress) => progressTracker.updateProgress(
          job.id.toString(),
          'analyzing',
          2,
          4,
          'Analyzing mutual connections',
          progress.details
        )
      );

      // Step 5: Create connection data and network graph
      console.log('[NetworkAnalysis] Step 5: Graph processing');
      const connectionData = this.prepareConnectionData(profile.did, mutuals);
      const networkGraph = graphProcessor.createGraph(
        profile.did,
        [], // No regular followers
        [], // No regular following
        connectionData,
        network.edges
      );

      // Step 6: Detect communities
      console.log('[NetworkAnalysis] Step 6: Community detection');
      const communities = graphProcessor.detectCommunities(networkGraph);

      await progressTracker.updateProgress(
        job.id.toString(),
        'processing',
        3,
        4,
        'Processing final results',
        {
          processedNodes: followers.length + following.length,
          processedEdges: mutuals.length,
          discoveredCommunities: communities.length
        }
      );

      // Create final analysis
      console.log('[NetworkAnalysis] Creating final analysis');
      const analysis: NetworkAnalysisResult = {
        userId: profile.did,
        handle: handle,
        stats: {
          followers: followers.length,
          following: following.length,
          mutuals: mutuals.length,
        },
        communities,
        lastUpdated: new Date().toISOString(),
      };

      // Store and return analysis
      console.log('[NetworkAnalysis] Storing analysis results');
      await cacheService.storeNetworkAnalysis(analysis, {
        duration: CACHE_DURATIONS.LONG_TERM,
        force: true,
      });

      await progressTracker.updateProgress(
        job.id.toString(),
        'completed',
        4,
        4,
        'Analysis complete',
        {
          processedNodes: followers.length + following.length,
          processedEdges: mutuals.length,
          discoveredCommunities: communities.length
        }
      );

      console.log('[NetworkAnalysis] Job processing completed successfully');
      console.log('- Final stats:', analysis.stats);
      return analysis;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unknown error occurred during network analysis';

      console.error(`[NetworkAnalysis] Error processing network analysis:`);
      console.error(`- Handle: ${handle}`);
      console.error(`- Error: ${errorMessage}`);
      
      await progressTracker.updateProgress(
        job.id.toString(),
        'error',
        0,
        4,
        `Analysis failed: ${errorMessage}`,
        {
          processedNodes: 0,
          processedEdges: 0,
          discoveredCommunities: 0
        }
      );
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Register the network analysis handler with the job processor
   * @param jobProcessor The job processor to register the handler with
   */
  registerHandler(jobProcessor: JobProcessor): void {
    console.log('[NetworkAnalysis] Registering network analyzer handler');
    // Bind this context to processJob
    jobProcessor.registerHandler(JobType.NETWORK_ANALYSIS, this.processJob.bind(this));
  }
}

// Create and export singleton instance
const networkAnalysisService = new NetworkAnalysisService();
export default networkAnalysisService;
