import mongoose from 'mongoose';
import { UserProfile, ConnectionData, NetworkAnalysisResult } from '../../shared/types';

/**
 * User Profile Cache Schema
 */
const userProfileCacheSchema = new mongoose.Schema({
  _id: {
    type: String, // BlueSky DID
    required: true,
  },
  handle: {
    type: String,
    required: true,
    index: true,
  },
  data: {
    did: String,
    handle: String,
    displayName: String,
    avatar: String,
    banner: String,
    description: String,
    followersCount: Number,
    followingCount: Number,
    postsCount: Number,
    indexedAt: String,
  },
  lastUpdated: {
    type: Date,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

// Index for cache invalidation
userProfileCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Connection Cache Schema
 */
const connectionCacheSchema = new mongoose.Schema({
  _id: {
    type: String, // userId + connectionId
    required: true,
  },
  userId: {
    type: String,
    required: true,
    index: true,
  },
  connectionData: {
    userId: String,
    connectionId: String,
    type: {
      type: String,
      enum: ['follower', 'following', 'mutual'],
    },
    profile: {
      did: String,
      handle: String,
      displayName: String,
      avatar: String,
      followersCount: Number,
      followingCount: Number,
      postsCount: Number,
      indexedAt: String,
    },
    lastInteraction: String,
  },
  lastUpdated: {
    type: Date,
    required: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

// Index for cache invalidation
connectionCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
connectionCacheSchema.index({ userId: 1, lastUpdated: -1 });
connectionCacheSchema.index({ userId: 1, 'connectionData.type': 1 });

/**
 * Network Analysis Result Schema
 */
const networkAnalysisSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },
  handle: {
    type: String,
    required: true,
    index: true,
  },
  stats: {
    followers: Number,
    following: Number,
    mutuals: Number,
  },
  communities: [{
    id: String,
    size: Number,
    members: [String],
    centralNodes: [String],
    metrics: {
      density: Number,
      cohesion: Number
    }
  }],
  lastUpdated: {
    type: Date,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
  },
}, {
  timestamps: true,
});

// Index for cache invalidation
networkAnalysisSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Cache duration constants
export const CACHE_DURATIONS = {
  SHORT_TERM: 24 * 60 * 60 * 1000, // 24 hours
  MEDIUM_TERM: 7 * 24 * 60 * 60 * 1000, // 7 days
  LONG_TERM: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;

// Document interfaces
export interface UserProfileCacheDocument extends mongoose.Document {
  _id: string;
  handle: string;
  data: UserProfile;
  lastUpdated: Date;
  expiresAt: Date;
}

export interface ConnectionCacheDocument extends mongoose.Document {
  _id: string;
  userId: string;
  connectionData: ConnectionData;
  lastUpdated: Date;
  expiresAt: Date;
}

export interface NetworkAnalysisDocument extends mongoose.Document {
  userId: string;
  handle: string;
  stats: {
    followers: number;
    following: number;
    mutuals: number;
  };
  communities: Array<{
    id: string;
    size: number;
    members: string[];
    centralNodes?: string[];
    metrics?: {
      density: number;
      cohesion: number;
    };
  }>;
  lastUpdated: Date;
  expiresAt: Date;
}

// Model interfaces
export interface UserProfileCacheModel extends mongoose.Model<UserProfileCacheDocument> {}
export interface ConnectionCacheModel extends mongoose.Model<ConnectionCacheDocument> {}
export interface NetworkAnalysisModel extends mongoose.Model<NetworkAnalysisDocument> {}

// Export models
export const UserProfileCache = mongoose.model<UserProfileCacheDocument, UserProfileCacheModel>('UserProfileCache', userProfileCacheSchema);
export const ConnectionCache = mongoose.model<ConnectionCacheDocument, ConnectionCacheModel>('ConnectionCache', connectionCacheSchema);
export const NetworkAnalysis = mongoose.model<NetworkAnalysisDocument, NetworkAnalysisModel>('NetworkAnalysis', networkAnalysisSchema);

// Helper functions
export function createCacheExpiration(duration: number): Date {
  return new Date(Date.now() + duration);
}

export function isCacheValid(lastUpdated: Date, duration: number): boolean {
  return (Date.now() - lastUpdated.getTime()) < duration;
}
