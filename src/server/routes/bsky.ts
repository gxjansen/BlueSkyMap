import { Router, Request, Response } from 'express';
import { requestQueue } from '../utils/requestQueue';
import atprotoService from '../services/atproto/index';
import { BskyFollower, BskyProfile } from '../services/atproto/interfaces';

const router = Router();

/**
 * Get user profile
 */
router.get('/profile/:handle', async (req: Request, res: Response) => {
  try {
    const handle = req.params.handle;
    const profile = await requestQueue.queueRequest(() => 
      atprotoService.getProfile(handle)
    ) as BskyProfile;
    res.json(profile);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get user followers
 */
router.get('/followers/:handle', async (req: Request, res: Response) => {
  try {
    const handle = req.params.handle;
    const followers = await requestQueue.queueRequest(() => 
      atprotoService.getFollowers(handle)
    ) as BskyFollower[];
    res.json(followers);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * Get user following
 */
router.get('/following/:handle', async (req: Request, res: Response) => {
  try {
    const handle = req.params.handle;
    const following = await requestQueue.queueRequest(() => 
      atprotoService.getFollowing(handle)
    ) as BskyFollower[];
    res.json(following);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'An unknown error occurred';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
