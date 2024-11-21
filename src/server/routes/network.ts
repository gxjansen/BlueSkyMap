import networkAnalyzer from '../services/network';
import jobProcessor from '../services/jobProcessor';
import Job, { JobStatus, JobType } from '../models/Job';
import { Router, Request, Response } from 'express';
import progressTracker from '../services/network/progressTracker';
import { UserProfileCache, ConnectionCache, NetworkAnalysis } from '../models/Cache';

const router = Router();

/**
 * Clear Cache Endpoint
 * Matches client's expected API route: /api/network/clear-cache/:handle
 */
router.post('/clear-cache/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    console.log(`[NetworkRoute] Clearing cache for handle: ${handle}`);

    // Clear all related caches
    await Promise.all([
      UserProfileCache.deleteMany({ handle }),
      ConnectionCache.deleteMany({ userId: { $regex: handle } }),
      NetworkAnalysis.deleteMany({ handle })
    ]);

    console.log(`[NetworkRoute] Cache cleared successfully for ${handle}`);
    res.status(200).json({ message: 'Cache cleared successfully' });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred while clearing cache';
    
    console.error(`[NetworkRoute] Cache clearing error: ${errorMessage}`);
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Network Analysis Job Endpoint
 * Matches client's expected API route: /api/network/analyze/:handle
 */
router.post('/analyze/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { force = false } = req.body;

    console.log(`[NetworkRoute] Received job creation request for handle: ${handle}, force: ${force}`);

    if (!handle) {
      console.error('[NetworkRoute] Handle is required');
      return res.status(400).json({ error: 'Handle is required' });
    }

    // Check for existing job
    const existingJob = await jobProcessor.getCurrentJob(handle);
    if (existingJob && !force) {
      console.log(`[NetworkRoute] Using existing job: ${existingJob._id}`);
      return res.status(202).json({
        message: 'Network analysis job already in progress',
        jobId: existingJob._id.toString()
      });
    }

    // Reset any existing jobs for this handle to allow reprocessing
    if (existingJob) {
      console.log(`[NetworkRoute] Resetting existing job for reprocessing`);
      existingJob.status = JobStatus.PENDING;
      existingJob.attempts = 0;
      existingJob.progress = progressTracker.createInitialProgress();
      await existingJob.save();
    }

    // Create a new job if none exists
    const job = existingJob || await jobProcessor.createJob(
      JobType.NETWORK_ANALYSIS,
      'system', // placeholder userId
      handle,
      { force },
      force ? 1 : 0 // Higher priority for force updates
    );

    console.log(`[NetworkRoute] Job ${job._id} ready for processing`);
    console.log(`- Status: ${job.status}`);
    console.log(`- Force: ${force}`);
    console.log(`- Handle: ${handle}`);

    // Return response
    res.status(202).json({
      message: 'Network analysis job started',
      jobId: job._id.toString()
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred during network analysis job creation';
    
    console.error(`[NetworkRoute] Network analysis job creation error: ${errorMessage}`);
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Job Status Endpoint
 * Matches client's expected API route: /api/network/analysis/:handle
 */
router.get('/analysis/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    console.log(`[NetworkRoute] Received job status request for handle: ${handle}`);

    const job = await jobProcessor.getCurrentJob(handle);
    console.log(`[NetworkRoute] Current job:`, job ? {
      id: job._id,
      status: job.status,
      progress: job.progress
    } : 'No current job');

    if (!job) {
      // If no current job, try to find the most recent completed job
      const lastCompletedJob = await Job.findOne({
        handle,
        status: JobStatus.COMPLETED
      }).sort({ updatedAt: -1 });

      console.log(`[NetworkRoute] Last completed job:`, lastCompletedJob ? {
        id: lastCompletedJob._id,
        status: lastCompletedJob.status,
        hasData: !!lastCompletedJob.data
      } : 'No completed job');

      if (lastCompletedJob) {
        console.log(`[NetworkRoute] Returning completed job data`);
        return res.json(lastCompletedJob.data);
      }

      console.log(`[NetworkRoute] No job found for handle`);
      return res.status(404).json({ error: 'No job found for this handle' });
    }

    // If job is complete, return full network data
    if (job.status === JobStatus.COMPLETED && job.data) {
      console.log(`[NetworkRoute] Job is completed, returning job data`);
      return res.json(job.data);
    }

    // Get the latest progress, either from job document or create initial progress
    const progress = job.progress || progressTracker.createInitialProgress();
    
    console.log(`[NetworkRoute] Returning job progress:`, {
      stage: progress.stage,
      current: progress.current,
      total: progress.total,
      details: progress.details
    });

    // Return progress with all details
    res.json({
      jobId: job._id.toString(),
      status: job.status,
      progress: {
        stage: progress.stage || job.status,
        current: progress.current,
        total: progress.total,
        message: progress.message,
        details: {
          processedNodes: progress.details?.processedNodes || 0,
          processedEdges: progress.details?.processedEdges || 0,
          discoveredCommunities: progress.details?.discoveredCommunities || 0
        }
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred while fetching job status';
    
    console.error(`[NetworkRoute] Job status retrieval error: ${errorMessage}`);
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
