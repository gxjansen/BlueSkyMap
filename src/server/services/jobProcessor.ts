import mongoose from 'mongoose';
import Job, { JobType, JobStatus, JobDocument, QUEUE_LIMITS } from '../models/Job';
import { AnalysisProgress } from '../../shared/types';

type JobHandler = (job: JobDocument) => Promise<any>;

/**
 * Job Processor Service
 * Handles job queue management and processing
 */
class JobProcessor {
  private handlers: Map<string, JobHandler>;
  private processingJobs: Set<string>;
  private processingInterval: NodeJS.Timeout | null;

  constructor() {
    this.handlers = new Map();
    this.processingJobs = new Set();
    this.processingInterval = null;
    console.log('[JobProcessor] Initialized');
    this.startProcessingInterval();
  }

  /**
   * Start the job processing interval
   */
  private startProcessingInterval(): void {
    console.log('[JobProcessor] Starting processing interval');
    // Check for new jobs every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processNextJob();
      this.checkStuckJobs();
    }, 5000);
  }

  /**
   * Check for stuck jobs and reset them
   */
  private async checkStuckJobs(): Promise<void> {
    try {
      console.log('[JobProcessor] Checking for stuck jobs');
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      // Find jobs that have been in_progress for too long
      const stuckJobs = await Job.find({
        status: JobStatus.IN_PROGRESS,
        startedAt: { $lt: fiveMinutesAgo }
      });

      if (stuckJobs.length > 0) {
        console.log(`[JobProcessor] Found ${stuckJobs.length} stuck jobs`);
        
        for (const job of stuckJobs) {
          console.log(`[JobProcessor] Resetting stuck job ${job._id}`);
          console.log(`- Handle: ${job.handle}`);
          console.log(`- Started at: ${job.startedAt}`);
          
          job.status = JobStatus.PENDING;
          job.startedAt = undefined;
          await job.save();
          
          this.processingJobs.delete(job._id.toString());
        }
      } else {
        console.log('[JobProcessor] No stuck jobs found');
      }
    } catch (error) {
      console.error('[JobProcessor] Error checking stuck jobs:', error);
    }
  }

  /**
   * Register a handler for a specific job type
   */
  registerHandler(type: JobType, handler: JobHandler): void {
    console.log(`[JobProcessor] Registering handler for job type: ${type}`);
    this.handlers.set(type, handler);
    // Immediately check for pending jobs of this type
    this.processNextJob();
  }

  /**
   * Create a new job
   */
  async createJob(
    type: JobType,
    userId: string,
    handle: string,
    data: any = {},
    priority: number = 0
  ): Promise<JobDocument> {
    console.log(`[JobProcessor] Creating job`);
    console.log(`- Type: ${type}`);
    console.log(`- Handle: ${handle}`);
    console.log(`- Priority: ${priority}`);

    // Check if there's already a job in progress for this handle
    const existingJob = await this.getCurrentJob(handle);
    if (existingJob) {
      console.log(`[JobProcessor] Found existing job for handle: ${handle}`);
      console.log(`- Job ID: ${existingJob._id}`);
      console.log(`- Status: ${existingJob.status}`);

      // If the job is stuck in 'in_progress' state for too long, reset it
      if (existingJob.status === JobStatus.IN_PROGRESS) {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        if (existingJob.startedAt && existingJob.startedAt < fiveMinutesAgo) {
          console.log(`[JobProcessor] Job appears to be stuck, resetting to pending`);
          existingJob.status = JobStatus.PENDING;
          existingJob.startedAt = undefined;
          await existingJob.save();
          this.processingJobs.delete(existingJob._id.toString());
          // Immediately try to process the reset job
          this.processNextJob();
        }
      }

      return existingJob;
    }

    const job = new Job({
      type,
      userId,
      handle,
      data,
      priority,
      status: JobStatus.PENDING,
      attempts: 0,
      maxAttempts: QUEUE_LIMITS.MAX_ATTEMPTS,
      estimatedWaitTime: await this.estimateWaitTime(),
      progress: {
        stage: 'initializing',
        current: 0,
        total: 4,
        message: 'Starting network analysis',
        details: {
          processedNodes: 0,
          processedEdges: 0,
          discoveredCommunities: 0
        }
      }
    });

    await job.save();
    console.log(`[JobProcessor] Created new job`);
    console.log(`- Job ID: ${job._id.toString()}`);
    console.log(`- Status: ${job.status}`);

    // Immediately try to process the new job
    this.processNextJob();

    return job;
  }

  /**
   * Get the current job for a handle
   */
  async getCurrentJob(handle: string): Promise<JobDocument | null> {
    console.log(`[JobProcessor] Getting current job for handle: ${handle}`);
    const job = await Job.findOne({
      handle,
      status: { $in: [JobStatus.PENDING, JobStatus.IN_PROGRESS] }
    });

    if (job) {
      console.log(`[JobProcessor] Found current job`);
      console.log(`- Job ID: ${job._id}`);
      console.log(`- Status: ${job.status}`);
      console.log(`- Progress:`, job.progress);
    } else {
      console.log(`[JobProcessor] No current job found for handle: ${handle}`);
    }

    return job;
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    try {
      console.log('[JobProcessor] Looking for next job to process');

      // Find the next job to process
      const job = await this.getNextJob();
      
      if (!job) {
        console.log('[JobProcessor] No jobs to process');
        return;
      }

      // Process the job
      await this.processJob(job);
    } catch (error) {
      console.error('[JobProcessor] Error in job processing:', error);
    }
  }

  /**
   * Get the next job to process
   */
  private async getNextJob(): Promise<JobDocument | null> {
    // Get jobs that aren't being processed and are pending
    const job = await Job.findOne({
      _id: { $nin: Array.from(this.processingJobs) },
      status: JobStatus.PENDING,
      type: JobType.NETWORK_ANALYSIS,
      $or: [
        { nextAttempt: { $exists: false } },
        { nextAttempt: { $lte: new Date() } }
      ]
    }).sort({ priority: -1, createdAt: 1 });

    if (job) {
      console.log('[JobProcessor] Found job to process');
      console.log(`- Job ID: ${job._id}`);
      console.log(`- Type: ${job.type}`);
      console.log(`- Handle: ${job.handle}`);
      console.log(`- Status: ${job.status}`);
    } else {
      console.log('[JobProcessor] No jobs found to process');
    }

    return job;
  }

  /**
   * Process a single job
   */
  private async processJob(job: JobDocument): Promise<void> {
    const jobId = job._id.toString();
    console.log(`[JobProcessor] Starting job processing`);
    console.log(`- Job ID: ${jobId}`);
    console.log(`- Handle: ${job.handle}`);
    console.log(`- Type: ${job.type}`);
    
    // Prevent concurrent processing of the same job
    if (this.processingJobs.has(jobId)) {
      console.log(`[JobProcessor] Job ${jobId} is already being processed`);
      return;
    }
    
    this.processingJobs.add(jobId);

    try {
      // Log the available handlers and the job type for debugging
      console.log('[JobProcessor] Available handlers:', Array.from(this.handlers.keys()));
      console.log('[JobProcessor] Job type:', job.type);

      const handler = this.handlers.get(job.type);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${job.type}`);
      }

      // Update job status
      job.status = JobStatus.IN_PROGRESS;
      job.startedAt = new Date();
      job.attempts += 1;
      await job.save();
      console.log(`[JobProcessor] Updated job status to IN_PROGRESS`);

      // Execute handler
      console.log(`[JobProcessor] Executing job handler`);
      const result = await handler(job);
      console.log(`[JobProcessor] Job handler execution completed`);
      console.log('- Result:', result);

      // Store result in job data
      job.data = result;
      
      // Complete job
      console.log(`[JobProcessor] Completing job ${jobId}`);
      await job.complete();
      console.log(`[JobProcessor] Job ${jobId} completed successfully`);

    } catch (error) {
      console.error(`[JobProcessor] Error processing job ${jobId}:`, error);

      // Handle job failure
      if (job.attempts >= job.maxAttempts) {
        console.log(`[JobProcessor] Job ${jobId} failed after max attempts`);
        await job.fail(error instanceof Error ? error.message : 'Unknown error');
      } else {
        // Calculate next attempt time with exponential backoff
        const backoff = Math.pow(2, job.attempts) * 1000;
        job.nextAttempt = new Date(Date.now() + backoff);
        job.status = JobStatus.FAILED;
        await job.save();

        console.log(`[JobProcessor] Scheduling retry for job ${jobId}`);
        console.log(`- Next attempt: ${job.nextAttempt}`);
        console.log(`- Backoff: ${backoff}ms`);

        // Schedule next attempt
        setTimeout(() => this.processNextJob(), backoff);
      }
    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  /**
   * Estimate wait time for new jobs
   */
  private async estimateWaitTime(): Promise<number> {
    const activeJobs = await Job.countDocuments({
      status: { $in: [JobStatus.PENDING, JobStatus.IN_PROGRESS] }
    });

    // Rough estimate: 30 seconds per job in queue
    return activeJobs * 30000;
  }

  /**
   * Stop processing jobs
   */
  async stop(): Promise<void> {
    console.log('[JobProcessor] Stopping job processor');
    
    // Clear the interval if it exists
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }
}

// Create and export singleton instance
const jobProcessor = new JobProcessor();
export default jobProcessor;
