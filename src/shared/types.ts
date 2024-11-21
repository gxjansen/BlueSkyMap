// User Types
export interface User {
  did: string;
  handle: string;
  displayName?: string;
}

// Network Types
export interface NetworkNode {
  id: string;
  type: 'user';
  data: User;
}

export interface NetworkEdge {
  source: string;
  target: string;
  type: 'follows' | 'mutual';
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

// Cache Types
export interface UserProfile extends User {
  avatar?: string;
  banner?: string;
  description?: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  indexedAt: string;
}

export type ConnectionType = 'follower' | 'following' | 'mutual';

export interface ConnectionData {
  userId: string;
  connectionId: string;
  type: ConnectionType;
  profile: UserProfile;
  lastInteraction?: string;
}

export interface Community {
  id: string;
  size: number;
  members: string[];
  centralNodes?: string[];
  metrics?: {
    density: number;
    cohesion: number;
  };
}

export interface NetworkAnalysisResult {
  userId: string;
  handle: string;
  stats: {
    followers: number;
    following: number;
    mutuals: number;
  };
  communities: Community[];
  lastUpdated: string;
}

// Progress Tracking
export type AnalysisStage = 
  | 'initializing'
  | 'collecting'
  | 'analyzing'
  | 'processing'
  | 'completed'
  | 'error';

export interface AnalysisProgress {
  stage: AnalysisStage;
  current: number;
  total: number;
  message: string;
  details: {
    processedNodes: number;
    processedEdges: number;
    discoveredCommunities: number;
  };
}

// Cache Control
export interface CacheOptions {
  duration: number;
  force?: boolean;
}

export interface CacheEntry<T> {
  data: T;
  lastUpdated: Date;
  expiresAt: Date;
}

// Network Analysis Types
export interface MutualNetwork {
  nodes: { id: string; handle: string }[];
  edges: { source: string; target: string }[];
}
