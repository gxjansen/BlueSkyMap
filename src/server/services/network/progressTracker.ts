import { AnalysisProgress, AnalysisStage } from '../../../shared/types';
import sseHandler from '../sseHandler';
import Job from '../../models/Job';

/**
 * ProgressTracker
 * Handles progress tracking and updates for network analysis
 */
class ProgressTracker {
  /**
   * Update analysis progress with SSE notifications and persist to job document
   */
  async updateProgress(
    jobId: string,
    stage: AnalysisStage,
    current: number,
    total: number,
    message: string,
    details: {
      processedNodes: number;
      processedEdges: number;
      discoveredCommunities: number;
    }
  ): Promise<void> {
    const progress: AnalysisProgress = {
      stage,
      current,
      total,
      message,
      details
    };

    console.log(`[ProgressTracker] Updating progress for job ${jobId}:`, progress);

    try {
      // Update job document with progress
      const job = await Job.findById(jobId);
      if (job) {
        console.log(`[ProgressTracker] Updating job document with progress`);
        await job.updateProgress(progress);
        console.log(`[ProgressTracker] Job document updated successfully`);
      } else {
        console.warn(`[ProgressTracker] Job ${jobId} not found for progress update`);
      }

      // Update SSE clients
      console.log(`[ProgressTracker] Sending SSE update`);
      sseHandler.updateJobProgress(jobId, progress);
      console.log(`[ProgressTracker] SSE update sent`);

    } catch (error) {
      console.error(`[ProgressTracker] Error updating progress for job ${jobId}:`, error);
      // Still try to send SSE update even if job update fails
      sseHandler.updateJobProgress(jobId, progress);
    }
  }

  /**
   * Create initial progress state
   */
  createInitialProgress(): AnalysisProgress {
    const progress = {
      stage: 'initializing' as const,
      current: 0,
      total: 4,
      message: 'Starting network analysis',
      details: {
        processedNodes: 0,
        processedEdges: 0,
        discoveredCommunities: 0
      }
    };

    console.log('[ProgressTracker] Created initial progress:', progress);
    return progress;
  }

  /**
   * Create completion progress state
   */
  createCompletionProgress(nodes: number, edges: number, communities: number): AnalysisProgress {
    const progress = {
      stage: 'completed' as const,
      current: 4,
      total: 4,
      message: 'Analysis complete',
      details: {
        processedNodes: nodes,
        processedEdges: edges,
        discoveredCommunities: communities
      }
    };

    console.log('[ProgressTracker] Created completion progress:', progress);
    return progress;
  }

  /**
   * Create error progress state
   */
  createErrorProgress(error: string): AnalysisProgress {
    const progress = {
      stage: 'error' as const,
      current: 0,
      total: 4,
      message: `Analysis failed: ${error}`,
      details: {
        processedNodes: 0,
        processedEdges: 0,
        discoveredCommunities: 0
      }
    };

    console.log('[ProgressTracker] Created error progress:', progress);
    return progress;
  }
}

// Create and export singleton instance
const progressTracker = new ProgressTracker();
export default progressTracker;
