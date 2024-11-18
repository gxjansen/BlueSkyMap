import mongoose from 'mongoose';

export enum JobType {
  NETWORK_ANALYSIS = 'networkAnalysis'
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RATE_LIMITED = 'rateLimited'
}

export interface JobProgress {
  stage: string;
  current: number;
  total: number;
  message: string;
}

// Constants
export const QUEUE_LIMITS = {
  MAX_CONCURRENT_JOBS: 10,
  DAILY_REFRESH_LIMIT: 5,
  PRIORITY_HANDLE: 'gui.do',
  REFRESH_RESET_HOUR_UTC: 0 // Midnight UTC
};

// Utility functions
function getJobUpdateQuery() {
  return {
    $set: {
      status: JobStatus.PROCESSING,
      startedAt: new Date()
    },
    $inc: { attempts: 1 }
  };
}

const jobSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  handle: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(JobType),
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: Object.values(JobStatus),
    default: JobStatus.PENDING,
    required: true,
    index: true
  },
  priority: {
    type: Number,
    default: 0,
    index: true
  },
  progress: {
    stage: String,
    current: Number,
    total: Number,
    message: String
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  startedAt: Date,
  completedAt: Date,
  error: String,
  result: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Result'
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  nextAttempt: Date,
  estimatedWaitTime: Number,
  refreshCount: {
    type: Number,
    default: 0
  },
  lastRefreshDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
jobSchema.index({ status: 1, priority: -1, createdAt: 1 });
jobSchema.index({ userId: 1, type: 1, status: 1 });
jobSchema.index({ handle: 1, lastRefreshDate: 1 });
jobSchema.index({ completedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 }); // Remove completed jobs after 7 days

// Instance methods
jobSchema.methods.updateProgress = async function(progress: Partial<JobProgress>) {
  this.progress = { ...this.progress, ...progress };
  return this.save();
};

jobSchema.methods.fail = async function(error: string) {
  this.status = JobStatus.FAILED;
  this.error = error;
  this.completedAt = new Date();
  return this.save();
};

jobSchema.methods.complete = async function(resultId?: mongoose.Types.ObjectId) {
  this.status = JobStatus.COMPLETED;
  this.completedAt = new Date();
  if (resultId) {
    this.result = resultId;
  }
  return this.save();
};

jobSchema.methods.incrementRefreshCount = async function() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  if (this.lastRefreshDate < today) {
    // Reset counter if last refresh was before today
    this.refreshCount = 1;
  } else {
    this.refreshCount += 1;
  }

  this.lastRefreshDate = new Date();
  return this.save();
};

// Static methods
jobSchema.statics.findNextJob = async function() {
  // Get current number of processing jobs
  const processingCount = await this.countDocuments({
    status: JobStatus.PROCESSING
  });

  if (processingCount >= QUEUE_LIMITS.MAX_CONCURRENT_JOBS) {
    return null;
  }

  // First try to find priority jobs
  let nextJob = await this.findOneAndUpdate(
    {
      status: JobStatus.PENDING,
      handle: QUEUE_LIMITS.PRIORITY_HANDLE
    },
    getJobUpdateQuery(),
    { sort: { createdAt: 1 }, new: true }
  );

  if (!nextJob) {
    // Then try to find regular jobs within refresh limits
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    nextJob = await this.findOneAndUpdate(
      {
        status: JobStatus.PENDING,
        handle: { $ne: QUEUE_LIMITS.PRIORITY_HANDLE },
        $or: [
          // First time analysis
          { refreshCount: { $exists: false } },
          // Within daily limit
          {
            lastRefreshDate: { $gte: today },
            refreshCount: { $lt: QUEUE_LIMITS.DAILY_REFRESH_LIMIT }
          },
          // New day reset counter
          { lastRefreshDate: { $lt: today } }
        ]
      },
      getJobUpdateQuery(),
      { sort: { priority: -1, createdAt: 1 }, new: true }
    );
  }

  return nextJob;
};

jobSchema.statics.updateWaitTimes = async function() {
  const processingCount = await this.countDocuments({
    status: JobStatus.PROCESSING
  });

  const availableSlots = Math.max(0, QUEUE_LIMITS.MAX_CONCURRENT_JOBS - processingCount);
  if (availableSlots === 0) {
    const avgProcessingTime = 5 * 60 * 1000; // 5 minutes as default
    const pendingJobs = await this.find({ status: JobStatus.PENDING })
      .sort({ priority: -1, createdAt: 1 });

    for (let i = 0; i < pendingJobs.length; i++) {
      const position = i + 1;
      const estimatedSlot = Math.ceil(position / QUEUE_LIMITS.MAX_CONCURRENT_JOBS);
      pendingJobs[i].estimatedWaitTime = estimatedSlot * avgProcessingTime;
      await pendingJobs[i].save();
    }
  }
};

export interface JobDocument extends mongoose.Document {
  userId: string;
  handle: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  progress?: JobProgress;
  data: any;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: mongoose.Types.ObjectId;
  attempts: number;
  maxAttempts: number;
  nextAttempt?: Date;
  estimatedWaitTime?: number;
  refreshCount: number;
  lastRefreshDate: Date;
  createdAt: Date;
  updatedAt: Date;

  updateProgress(progress: Partial<JobProgress>): Promise<JobDocument>;
  fail(error: string): Promise<JobDocument>;
  complete(resultId?: mongoose.Types.ObjectId): Promise<JobDocument>;
  incrementRefreshCount(): Promise<JobDocument>;
}

export interface JobModel extends mongoose.Model<JobDocument> {
  findNextJob(): Promise<JobDocument | null>;
  updateWaitTimes(): Promise<void>;
}

const Job = mongoose.model<JobDocument, JobModel>('Job', jobSchema);
export default Job;
