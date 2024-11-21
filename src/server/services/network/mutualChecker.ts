import atprotoService, { 
  getProfile, 
  getFollowers, 
  getFollowing 
} from '../atproto/index';
import { requestQueue } from '../../utils/requestQueue';
import { BskyFollower } from '../atproto/interfaces';

/**
 * MutualChecker
 * Handles checking mutual connections between users
 */
class MutualChecker {
  /**
   * Check if two users are mutually connected
   * Uses rate limiting through request queue
   */
  async areMutuallyConnected(user1: string, user2: string): Promise<boolean> {
    console.log(`[MutualChecker] Checking mutual connection between ${user1} and ${user2}`);
    
    try {
      // Get user1's following list
      console.log(`[MutualChecker] Fetching following list for ${user1}`);
      const user1Following = await requestQueue.queueRequest(() => 
        getFollowing(user1)
      ) as BskyFollower[];
      
      // Check if user1 follows user2
      const user1FollowsUser2 = user1Following.some(f => f.handle === user2);
      console.log(`[MutualChecker] ${user1} follows ${user2}: ${user1FollowsUser2}`);

      if (!user1FollowsUser2) {
        console.log(`[MutualChecker] ${user1} does not follow ${user2}, not mutual`);
        return false;
      }

      // Get user2's following list
      console.log(`[MutualChecker] Fetching following list for ${user2}`);
      const user2Following = await requestQueue.queueRequest(() => 
        getFollowing(user2)
      ) as BskyFollower[];
      
      // Check if user2 follows user1
      const user2FollowsUser1 = user2Following.some(f => f.handle === user1);
      console.log(`[MutualChecker] ${user2} follows ${user1}: ${user2FollowsUser1}`);

      // They are mutual followers if both follow each other
      const isMutual = user1FollowsUser2 && user2FollowsUser1;
      console.log(`[MutualChecker] Mutual connection result: ${isMutual}`);
      
      return isMutual;

    } catch (error) {
      console.error(`[MutualChecker] Error checking mutual connection:`, error);
      console.error(`- User1: ${user1}`);
      console.error(`- User2: ${user2}`);
      return false;
    }
  }
}

// Create and export singleton instance
const mutualChecker = new MutualChecker();
export default mutualChecker;
