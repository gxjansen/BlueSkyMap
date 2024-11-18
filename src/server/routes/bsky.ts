import { Router } from 'express';
import type { Request, Response } from 'express';
import { rateLimiterMiddleware, getRateLimitStatus } from '../middleware/rateLimiter';
import atprotoService from '../services/atproto';

const router = Router();

/**
 * Apply rate limiting to all BlueSky routes
 */
router.use(rateLimiterMiddleware);

/**
 * GET /api/bsky/profile/:handle
 * Get profile information for a BlueSky user
 */
router.get('/profile/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const profile = await atprotoService.getProfile(handle);
    
    // Include rate limit info in response headers
    const rateLimitInfo = await getRateLimitStatus(req.ip || 'unknown');
    res.set({
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': rateLimitInfo.reset.toString(),
    });

    res.json(profile);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ 
      error: 'Failed to fetch profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/bsky/network/:handle
 * Get social graph data for a BlueSky user
 */
router.get('/network/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    
    // Fetch followers and following lists concurrently
    const [followers, following] = await Promise.all([
      atprotoService.getFollowers(handle),
      atprotoService.getFollowing(handle)
    ]);

    // Find mutual connections
    const mutuals = followers.filter(follower => 
      following.some(follow => follow.did === follower.did)
    );

    // Include rate limit info in response headers
    const rateLimitInfo = await getRateLimitStatus(req.ip || 'unknown');
    res.set({
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': rateLimitInfo.reset.toString(),
    });

    res.json({
      followers,
      following,
      mutuals,
      stats: {
        followersCount: followers.length,
        followingCount: following.length,
        mutualsCount: mutuals.length,
      }
    });
  } catch (error) {
    console.error('Error fetching network data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch network data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/bsky/resolve/:handle
 * Resolve a handle to a DID
 */
router.get('/resolve/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const did = await atprotoService.resolveDid(handle);
    
    // Include rate limit info in response headers
    const rateLimitInfo = await getRateLimitStatus(req.ip || 'unknown');
    res.set({
      'X-RateLimit-Remaining': rateLimitInfo.remaining.toString(),
      'X-RateLimit-Reset': rateLimitInfo.reset.toString(),
    });

    res.json({ handle, did });
  } catch (error) {
    console.error('Error resolving handle:', error);
    res.status(500).json({ 
      error: 'Failed to resolve handle',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
