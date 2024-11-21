import atprotoService, { 
  getProfile, 
  getFollowers, 
  getFollowing 
} from '../atproto/index';
import mutualChecker from './mutualChecker';
import progressTracker from './progressTracker';
import { BskyFollower } from '../atproto/interfaces';
import { requestQueue } from '../../utils/requestQueue';
import { AnalysisStage } from '../../../shared/types';

// Define total steps as a constant
const TOTAL_STEPS = 4;

/**
 * NetworkBuilder
 * Constructs network connections and relationships between users
 */
class NetworkBuilder {
  /**
   * Build a complete network for a given handle
   * Provides a comprehensive network analysis with detailed progress tracking
   */
  async buildCompleteNetwork(
    userId: string, 
    handle: string, 
    mutuals: { did: string; handle: string }[],
    updateProgress: (progress: any) => Promise<void>
  ): Promise<any> {
    console.log(`[NetworkBuilder] Starting network build`);
    console.log(`- User ID: ${userId}`);
    console.log(`- Handle: ${handle}`);
    console.log(`- Initial mutuals: ${mutuals.length}`);

    // Track current step for progress
    let currentStep = 0;
    let processedNodes = 0;
    let processedEdges = 0;
    let discoveredCommunities = 0;

    try {
      // Update initial progress
      console.log('[NetworkBuilder] Initializing progress tracking');
      await updateProgress({
        stage: 'initializing' as AnalysisStage,
        current: currentStep,
        total: TOTAL_STEPS,
        message: `Starting network analysis for ${handle}`,
        details: {
          processedNodes,
          processedEdges,
          discoveredCommunities
        }
      });

      // Fetch user profile
      console.log('[NetworkBuilder] Fetching user profile');
      const profile = await requestQueue.queueRequest(() => 
        getProfile(handle)
      );
      currentStep++;
      processedNodes = 1; // Count the user's profile as first node

      console.log('[NetworkBuilder] Profile fetched');
      console.log(`- Profile DID: ${profile.did}`);
      console.log(`- Processed nodes: ${processedNodes}`);

      // Update progress after profile fetch
      await updateProgress({
        stage: 'profile' as AnalysisStage,
        current: currentStep,
        total: TOTAL_STEPS,
        message: `Fetched profile for ${handle}`,
        details: {
          processedNodes,
          processedEdges,
          discoveredCommunities
        }
      });

      // Fetch followers and following
      console.log('[NetworkBuilder] Fetching connections');
      const [followers, following] = await Promise.all([
        requestQueue.queueRequest(() => getFollowers(handle)) as Promise<BskyFollower[]>,
        requestQueue.queueRequest(() => getFollowing(handle)) as Promise<BskyFollower[]>
      ]);
      currentStep++;
      processedNodes += followers.length + following.length;

      console.log('[NetworkBuilder] Connections fetched');
      console.log(`- Followers: ${followers.length}`);
      console.log(`- Following: ${following.length}`);
      console.log(`- Total processed nodes: ${processedNodes}`);

      // Update progress after connections fetch
      await updateProgress({
        stage: 'connections' as AnalysisStage,
        current: currentStep,
        total: TOTAL_STEPS,
        message: `Fetched ${followers.length} followers and ${following.length} following`,
        details: {
          processedNodes,
          processedEdges,
          discoveredCommunities
        }
      });

      // Check mutual connections
      console.log('[NetworkBuilder] Checking mutual connections');
      let processedConnections = 0;
      const totalConnections = following.length;
      
      const mutualConnections = await Promise.all(
        following.map(async (connection: BskyFollower) => {
          console.log(`- Checking mutual status for: ${connection.handle}`);
          const isMutual = await mutualChecker.areMutuallyConnected(handle, connection.handle);
          
          // Update progress for each processed connection
          processedConnections++;
          processedEdges = mutuals.filter(m => m.did === connection.did).length;
          
          await updateProgress({
            stage: 'analyzing' as AnalysisStage,
            current: currentStep,
            total: TOTAL_STEPS,
            message: `Analyzing connections (${processedConnections}/${totalConnections})`,
            details: {
              processedNodes,
              processedEdges,
              discoveredCommunities
            }
          });

          return {
            ...connection,
            isMutual
          };
        })
      );
      currentStep++;
      processedEdges = mutualConnections.filter(conn => conn.isMutual).length;

      console.log('[NetworkBuilder] Mutual check complete');
      console.log(`- Total mutual connections: ${processedEdges}`);

      // Update progress after mutual connections
      await updateProgress({
        stage: 'analyzing' as AnalysisStage,
        current: currentStep,
        total: TOTAL_STEPS,
        message: 'Analyzing mutual connections',
        details: {
          processedNodes,
          processedEdges,
          discoveredCommunities
        }
      });

      // Analyze network
      console.log('[NetworkBuilder] Analyzing network');
      const networkAnalysis = {
        totalConnections: mutualConnections.length,
        mutualConnections: mutualConnections.filter(conn => conn.isMutual).length,
        networkCompleteness: this.calculateNetworkCompleteness({
          profile, 
          followers, 
          following: mutualConnections
        })
      };

      // Set discovered communities (for now just one community containing all mutuals)
      discoveredCommunities = 1;

      console.log('[NetworkBuilder] Network analysis complete');
      console.log('- Network stats:', networkAnalysis);
      console.log(`- Final processed nodes: ${processedNodes}`);
      console.log(`- Final processed edges: ${processedEdges}`);
      console.log(`- Final discovered communities: ${discoveredCommunities}`);

      // Final progress update
      await updateProgress({
        stage: 'complete' as AnalysisStage,
        current: TOTAL_STEPS,
        total: TOTAL_STEPS,
        message: 'Network analysis complete',
        details: {
          processedNodes,
          processedEdges,
          discoveredCommunities
        }
      });

      const result = {
        userId,
        handle,
        profile,
        followers,
        following: mutualConnections,
        networkAnalysis,
        edges: mutualConnections.filter(conn => conn.isMutual).map(conn => ({
          source: userId,
          target: conn.did,
          type: 'mutual'
        }))
      };

      console.log('[NetworkBuilder] Returning complete network data');
      return result;

    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'An unknown error occurred during network analysis';

      console.error(`[NetworkBuilder] Failed to build network:`);
      console.error(`- Handle: ${handle}`);
      console.error(`- Error: ${errorMessage}`);
      
      // Error progress update
      await updateProgress({
        stage: 'error' as AnalysisStage,
        current: 0,
        total: TOTAL_STEPS,
        message: `Network analysis failed: ${errorMessage}`,
        details: {
          processedNodes: 0,
          processedEdges: 0,
          discoveredCommunities: 0
        }
      });

      throw new Error(errorMessage);
    }
  }

  /**
   * Calculate network completeness based on available data
   */
  private calculateNetworkCompleteness(network: any): number {
    const { followers, following, profile } = network;
    
    const completenessFactors = [
      followers?.length > 0 ? 1 : 0,
      following?.length > 0 ? 1 : 0,
      profile ? 1 : 0
    ];

    const completeness = (completenessFactors.reduce((a, b) => a + b, 0) / completenessFactors.length) * 100;
    console.log('[NetworkBuilder] Network completeness calculated:', completeness);
    
    return completeness;
  }
}

// Create and export singleton instance
const networkBuilder = new NetworkBuilder();
export default networkBuilder;
