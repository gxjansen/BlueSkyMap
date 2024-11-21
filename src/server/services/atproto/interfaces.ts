export interface BskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followersCount: number;
  followingCount: number;
  followsCount: number;
  postsCount: number;
  indexedAt: string;
}

export interface BskyFollower {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
  followersCount: number;
  followingCount: number;
  followsCount: number;
  postsCount: number;
}
