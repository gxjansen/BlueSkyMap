import mongoose, { Document, Schema } from 'mongoose';
import { AnalysisProgress } from '../../shared/types';

export enum JobType {
  NETWORK_ANALYSIS = 'network_analysis'
}

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RATE_LIMITED = 'rate_limited'
}

export const QUEUE_LIMITS = {
  DAILY_REFRESH_LIMIT: 5,
  PRIORITY_HANDLE: 'gui.do',
  MAX_CONCURRENT_JOBS: 10,
  MAX_ATTEMPTS: 3
};

interface IJob {
  type: JobType;
  userId: string;
  handle: string;
  status: JobStatus;
  data: any;
  error?: string;
  priority: number;
  progress?: AnalysisProgress;
  attempts: number;
  maxAttempts: number;
  nextAttempt?: Date;
  refreshCount: number;
  estimatedWaitTime?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobDocument extends Document, IJob {
  _id: Schema.Types.ObjectId;
  updateProgress: (progress: AnalysisProgress) => Promise<void>;
  incrementRefreshCount: () => Promise<void>;
  complete: () => Promise<void>;
  fail: (error: string) => Promise<void>;
}

const jobSchema = new Schema<JobDocument>({
  type: {
    type: String,
    required: true,
    enum: {
      values: Object.values(JobType),
      message: '{VALUE} is not a valid job type'
    }
  },
  userId: {
    type: String,
    required: true
  },
  handle: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: Object.values(JobStatus),
    default: JobStatus.PENDING
  },
  data: {
    type: Schema.Types.Mixed,
    default: {}
  },
  error: String,
  priority: {
    type: Number,
    default: 0
  },
  progress: {
    type: {
      stage: {
        type: String,
        required: true,
        default: 'initializing'
      },
      current: {
        type: Number,
        required: true,
        default: 0
      },
      total: {
        type: Number,
        required: true,
        default: 4
      },
      message: {
        type: String,
        required: true,
        default: 'Starting network analysis'
      },
      details: {
        processedNodes: {
          type: Number,
          required: true,
          default: 0
        },
        processedEdges: {
          type: Number,
          required: true,
          default: 0
        },
        discoveredCommunities: {
          type: Number,
          required: true,
          default: 0
        }
      }
    },
    required: true,
    default: {
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
  },
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: QUEUE_LIMITS.MAX_ATTEMPTS
  },
  nextAttempt: Date,
  refreshCount: {
    type: Number,
    default: 0
  },
  estimatedWaitTime: Number,
  startedAt: Date,
  completedAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Add index for finding jobs by handle and status
jobSchema.index({ handle: 1, status: 1 });

// Add index for finding jobs by userId and date
jobSchema.index({ userId: 1, createdAt: -1 });

// Add method to update progress
jobSchema.methods.updateProgress = async function(progress: AnalysisProgress) {
  console.log(`[Job] Updating progress for job ${this._id}`);
  console.log('- Current progress:', this.progress);
  console.log('- New progress:', progress);

  // Ensure all required fields are present with defaults if not provided
  this.progress = {
    stage: progress.stage || 'initializing',
    current: progress.current || 0,
    total: progress.total || 4,
    message: progress.message || 'Processing',
    details: {
      processedNodes: progress.details?.processedNodes || 0,
      processedEdges: progress.details?.processedEdges || 0,
      discoveredCommunities: progress.details?.discoveredCommunities || 0
    }
  };

  // Mark the progress field as modified to ensure mongoose saves it
  this.markModified('progress');
  
  // Save the document
  await this.save();
  
  console.log(`[Job] Progress updated successfully`);
  console.log('- Updated progress:', this.progress);
};

// Add method to increment refresh count
jobSchema.methods.incrementRefreshCount = async function() {
  console.log(`[Job] Incrementing refresh count for job ${this._id}`);
  console.log('- Current count:', this.refreshCount);
  
  this.refreshCount = (this.refreshCount || 0) + 1;
  await this.save();
  
  console.log('- New count:', this.refreshCount);
};

// Add method to complete job
jobSchema.methods.complete = async function() {
  console.log(`[Job] Completing job ${this._id}`);
  console.log('- Current status:', this.status);
  
  this.status = JobStatus.COMPLETED;
  this.completedAt = new Date();
  await this.save();
  
  console.log('- Job completed successfully');
};

// Add method to fail job
jobSchema.methods.fail = async function(error: string) {
  console.log(`[Job] Failing job ${this._id}`);
  console.log('- Current status:', this.status);
  console.log('- Error:', error);
  
  this.status = JobStatus.FAILED;
  this.error = error;
  this.completedAt = new Date();
  await this.save();
  
  console.log('- Job marked as failed');
};

const Job = mongoose.model<JobDocument>('Job', jobSchema);

export default Job;
