import { EventEmitter } from 'events';
import Job, { JobDocument, JobStatus, JobType, QUEUE_LIMITS } from '../models/Job';

class JobProcessor extends EventEmitter {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private jobHandlers: Map<JobType, (job: JobDocument) => Promise<any>>;
  private readonly POLLING_INTERVAL = 1000; // 1 second
  private lastPollTime: number = 0;
  private isProcessingJob: boolean = false;

  constructor() {
    super();
    this.jobHandlers = new Map();
  }

  /**
   * Register a handler for a specific job type
   */
  registerHandler(type: JobType, handler: (job: JobDocument) => Promise<any>): void {
    console.log(`Registering handler for job type: ${type}`);
    this.jobHandlers.set(type, handler);
  }

  /**
   * Start the job processor
   */
  start(pollingInterval: number = this.POLLING_INTERVAL): void {
    if (this.processingInterval) {
      return;
    }

    this.isProcessing = true;
    this.processingInterval = setInterval(async () => {
      try {
        // Only process if we're not already processing a job
        if (!this.isProcessingJob) {
          await this.processNextJob();
        }
      } catch (error) {
        console.error('Error in job processor interval:', error);
      }
    }, pollingInterval);

    console.log(`Job processor started with ${pollingInterval}ms polling interval`);
  }

  /**
   * Stop the job processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    console.log('Job processor stopped');
  }

  /**
   * Create a new job
   */
  async createJob(
    type: JobType,
    userId: string,
    handle: string,
    data: any,
    priority: number = 0
  ): Promise<JobDocument> {
    console.log(`Creating job of type ${type} for handle ${handle}`);

    // Check if user has exceeded daily refresh limit
    if (handle !== QUEUE_LIMITS.PRIORITY_HANDLE) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      const existingJob = await Job.findOne({
        handle,
        lastRefreshDate: { $gte: today }
      });

      if (existingJob && existingJob.refreshCount >= QUEUE_LIMITS.DAILY_REFRESH_LIMIT) {
        const job = new Job({
          type,
          userId,
          handle,
          data,
          priority,
          status: JobStatus.RATE_LIMITED,
          error: 'Daily refresh limit exceeded'
        });
        await job.save();
        this.emit('jobRateLimited', job);
        return job;
      }
    }

    // Create new job
    const job = new Job({
      type,
      userId,
      handle,
      data,
      priority: handle === QUEUE_LIMITS.PRIORITY_HANDLE ? Number.MAX_SAFE_INTEGER : priority,
      status: JobStatus.PENDING
    });

    await job.save();
    this.emit('jobCreated', job);
    return job;
  }

  /**
   * Process the next available job
   */
  private async processNextJob(): Promise<void> {
    if (!this.isProcessing || this.isProcessingJob) {
      return;
    }

    this.isProcessingJob = true;
    let currentJob: JobDocument | null = null;

    try {
      // Find next pending job
      currentJob = await Job.findOne(
        {
          status: JobStatus.PENDING,
          $or: [
            { nextAttempt: { $exists: false } },
            { nextAttempt: { $lte: new Date() } }
          ]
        },
        null,
        { sort: { priority: -1, createdAt: 1 } }
      );

      if (!currentJob) {
        this.isProcessingJob = false;
        return;
      }

      console.log(`Processing job ${currentJob._id} of type ${currentJob.type} (attempt ${currentJob.attempts + 1}/${currentJob.maxAttempts})`);

      // Update job status to processing
      currentJob.status = JobStatus.PROCESSING;
      currentJob.startedAt = new Date();
      currentJob.attempts += 1;
      await currentJob.save();

      const handler = this.jobHandlers.get(currentJob.type as JobType);
      if (!handler) {
        throw new Error(`No handler registered for job type: ${currentJob.type}`);
      }

      // Increment refresh count
      await currentJob.incrementRefreshCount();
      this.emit('jobStarted', currentJob);

      // Execute the job handler
      const result = await handler(currentJob);

      // Complete the job
      await currentJob.complete(result?._id);
      console.log(`Job ${currentJob._id} completed successfully`);
      this.emit('jobCompleted', currentJob);

    } catch (error) {
      console.error(`Error processing job:`, error);

      if (currentJob) {
        const shouldRetry = currentJob.attempts < currentJob.maxAttempts;
        if (shouldRetry) {
          // Calculate next attempt time with exponential backoff
          const backoffDelay = Math.pow(2, currentJob.attempts - 1) * 1000;
          currentJob.nextAttempt = new Date(Date.now() + backoffDelay);
          currentJob.status = JobStatus.PENDING;
          await currentJob.save();
          console.log(`Job ${currentJob._id} scheduled for retry in ${backoffDelay}ms`);
          this.emit('jobRetrying', currentJob);
        } else {
          await currentJob.fail(error instanceof Error ? error.message : 'Unknown error');
          console.log(`Job ${currentJob._id} failed after ${currentJob.attempts} attempts`);
          this.emit('jobFailed', currentJob);
        }
      }
    } finally {
      this.isProcessingJob = false;
    }
  }

  /**
   * Get job status and progress
   */
  async getJobStatus(jobId: string): Promise<JobDocument | null> {
    return Job.findById(jobId);
  }

  /**
   * Get all jobs for a user
   */
  async getUserJobs(userId: string): Promise<JobDocument[]> {
    return Job.find({ userId }).sort({ createdAt: -1 });
  }

  /**
   * Get user's refresh count for today
   */
  async getUserRefreshCount(handle: string): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const job = await Job.findOne({
      handle,
      lastRefreshDate: { $gte: today }
    });

    return job?.refreshCount || 0;
  }

  /**
   * Clean up old jobs
   */
  async cleanupOldJobs(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await Job.deleteMany({
      $or: [
        { status: JobStatus.COMPLETED, completedAt: { $lt: thirtyDaysAgo } },
        { status: JobStatus.FAILED, completedAt: { $lt: thirtyDaysAgo } },
        { status: JobStatus.RATE_LIMITED, createdAt: { $lt: thirtyDaysAgo } }
      ]
    });
  }
}

// Create and export singleton instance
const jobProcessor = new JobProcessor();
export default jobProcessor;
