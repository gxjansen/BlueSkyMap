import { JobDocument, JobType } from '../../models/Job';
import { NetworkAnalysisResult } from '../../../shared/types';
import jobHandler from './jobHandler';
import networkBuilder from './networkBuilder';
import mutualChecker from './mutualChecker';
import progressTracker from './progressTracker';

/**
 * NetworkAnalyzer
 * Main orchestrator for network analysis functionality
 * Coordinates between different components while maintaining separation of concerns
 */
class NetworkAnalyzer {
  private initialized: boolean = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize the network analyzer
   */
  private initialize(): void {
    if (this.initialized) {
      return;
    }

    console.log('[NetworkAnalyzer] Initializing Network Analyzer...');
    this.initialized = true;
  }

  /**
   * Process a network analysis job
   * Delegates to job handler while providing access to other components
   */
  async processJob(job: JobDocument): Promise<NetworkAnalysisResult> {
    console.log(`[NetworkAnalyzer] Processing job ${job.id} for handle ${job.handle}`);
    try {
      const result = await jobHandler.processJob(job);
      console.log(`[NetworkAnalyzer] Job ${job.id} processed successfully`);
      return result;
    } catch (error) {
      console.error(`[NetworkAnalyzer] Error processing job ${job.id}:`, error);
      throw error;
    }
  }

  /**
   * Register handlers with the job processor
   */
  registerHandler(jobProcessor: any): void {
    console.log('[NetworkAnalyzer] Registering network analyzer handler');
    // Bind the processJob method to this instance to preserve context
    jobProcessor.registerHandler(JobType.NETWORK_ANALYSIS, this.processJob.bind(this));
  }

  /**
   * Check if two users are mutually connected
   */
  async areMutuallyConnected(user1: string, user2: string): Promise<boolean> {
    console.log(`[NetworkAnalyzer] Checking mutual connection between ${user1} and ${user2}`);
    return mutualChecker.areMutuallyConnected(user1, user2);
  }

  /**
   * Build network for a user
   */
  async buildNetwork(
    userId: string,
    handle: string,
    mutuals: { did: string; handle: string }[],
    updateProgress: (progress: any) => Promise<void>
  ): Promise<any> {
    console.log(`[NetworkAnalyzer] Building network for ${handle}`);
    return networkBuilder.buildCompleteNetwork(userId, handle, mutuals, updateProgress);
  }

  /**
   * Create progress tracker instance
   */
  getProgressTracker(): typeof progressTracker {
    return progressTracker;
  }
}

// Create and export singleton instance
const networkAnalyzer = new NetworkAnalyzer();
export default networkAnalyzer;

// Export individual components for direct access if needed
export {
  jobHandler,
  networkBuilder,
  mutualChecker,
  progressTracker
};
