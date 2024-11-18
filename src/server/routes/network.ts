import { Router } from 'express';
import type { Request, Response } from 'express';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { JobType, JobStatus, QUEUE_LIMITS } from '../models/Job';
import jobProcessor from '../services/jobProcessor';
import cacheService from '../services/cacheService';
import atprotoService from '../services/atproto';
import { CACHE_DURATIONS } from '../models/Cache';
import { ConnectionType } from '../../shared/types';

const router = Router();

// Apply rate limiting to all network routes
router.use(rateLimiterMiddleware);

/**
 * POST /api/network/analyze/:handle
 * Start a network analysis job
 */
router.post('/analyze/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { force = false } = req.body;

    // Ensure AT Protocol service is authenticated
    if (!atprotoService.isAuthenticated()) {
      await atprotoService.initialize();
    }

    // Use the authenticated user's credentials
    const userId = process.env.BSKY_IDENTIFIER?.split('.')[0] || 'default';

    // Check if we have a recent analysis
    if (!force) {
      const cached = await cacheService.getNetworkAnalysis(handle, {
        duration: CACHE_DURATIONS.LONG_TERM,
        force: false,
      });
      
      if (cached) {
        return res.json(cached);
      }
    }

    // Get current refresh count
    const refreshCount = await jobProcessor.getUserRefreshCount(handle);
    if (handle !== QUEUE_LIMITS.PRIORITY_HANDLE && 
        refreshCount >= QUEUE_LIMITS.DAILY_REFRESH_LIMIT) {
      return res.status(429).json({
        error: 'Rate Limited',
        message: 'Daily refresh limit exceeded',
        limit: QUEUE_LIMITS.DAILY_REFRESH_LIMIT,
        resetAt: new Date().setUTCHours(24, 0, 0, 0),
      });
    }

    // Create analysis job
    const job = await jobProcessor.createJob(
      JobType.NETWORK_ANALYSIS,
      userId,
      handle,
      { force },
      1 // High priority
    );

    // If job was rate limited, return appropriate response
    if (job.status === JobStatus.RATE_LIMITED) {
      return res.status(429).json({
        error: 'Rate Limited',
        message: job.error,
        limit: QUEUE_LIMITS.DAILY_REFRESH_LIMIT,
        resetAt: new Date().setUTCHours(24, 0, 0, 0),
      });
    }

    res.status(202).json({
      message: 'Network analysis started',
      jobId: job._id,
      status: job.status,
      estimatedWaitTime: job.estimatedWaitTime,
      refreshesRemaining: QUEUE_LIMITS.DAILY_REFRESH_LIMIT - (refreshCount + 1),
    });
  } catch (error) {
    console.error('Error starting network analysis:', error);
    res.status(500).json({ 
      error: 'Failed to start network analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/network/profile/:handle
 * Get user profile with connections summary
 */
router.get('/profile/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { force } = req.query;

    // Ensure AT Protocol service is authenticated
    if (!atprotoService.isAuthenticated()) {
      await atprotoService.initialize();
    }

    const [profile, analysis] = await Promise.all([
      cacheService.getUserProfile(handle, {
        duration: CACHE_DURATIONS.SHORT_TERM,
        force: force === 'true',
      }),
      cacheService.getNetworkAnalysis(handle, {
        duration: CACHE_DURATIONS.LONG_TERM,
        force: force === 'true',
      }),
    ]);

    // Get refresh count
    const refreshCount = await jobProcessor.getUserRefreshCount(handle);

    res.json({
      profile,
      stats: analysis.stats,
      lastUpdated: analysis.lastUpdated,
      refreshes: {
        used: refreshCount,
        remaining: QUEUE_LIMITS.DAILY_REFRESH_LIMIT - refreshCount,
        limit: QUEUE_LIMITS.DAILY_REFRESH_LIMIT,
        resetAt: new Date().setUTCHours(24, 0, 0, 0),
      },
    });
  } catch (error) {
    console.error('Error fetching network profile:', error);
    res.status(500).json({ 
      error: 'Failed to fetch network profile',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/network/connections/:handle
 * Get user connections with optional filtering
 */
router.get('/connections/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { type = 'all', force } = req.query;

    // Ensure AT Protocol service is authenticated
    if (!atprotoService.isAuthenticated()) {
      await atprotoService.initialize();
    }

    const options = {
      duration: CACHE_DURATIONS.SHORT_TERM,
      force: force === 'true',
    };

    let connections;
    switch (type) {
      case 'follower':
        connections = await cacheService.getUserConnections(handle, 'follower', options);
        break;
      case 'following':
        connections = await cacheService.getUserConnections(handle, 'following', options);
        break;
      case 'mutual':
        connections = await cacheService.getMutualConnections(handle, options);
        break;
      case 'all':
      default:
        const [followers, following, mutuals] = await Promise.all([
          cacheService.getUserConnections(handle, 'follower', options),
          cacheService.getUserConnections(handle, 'following', options),
          cacheService.getMutualConnections(handle, options),
        ]);
        connections = {
          followers,
          following,
          mutuals,
        };
    }

    res.json(connections);
  } catch (error) {
    console.error('Error fetching connections:', error);
    res.status(500).json({ 
      error: 'Failed to fetch connections',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/network/analysis/:handle
 * Get network analysis results
 */
router.get('/analysis/:handle', async (req: Request, res: Response) => {
  try {
    const { handle } = req.params;
    const { force } = req.query;

    // Ensure AT Protocol service is authenticated
    if (!atprotoService.isAuthenticated()) {
      await atprotoService.initialize();
    }

    const analysis = await cacheService.getNetworkAnalysis(handle, {
      duration: CACHE_DURATIONS.LONG_TERM,
      force: force === 'true',
    });

    // Get refresh count
    const refreshCount = await jobProcessor.getUserRefreshCount(handle);

    res.json({
      ...analysis,
      refreshes: {
        used: refreshCount,
        remaining: QUEUE_LIMITS.DAILY_REFRESH_LIMIT - refreshCount,
        limit: QUEUE_LIMITS.DAILY_REFRESH_LIMIT,
        resetAt: new Date().setUTCHours(24, 0, 0, 0),
      },
    });
  } catch (error) {
    console.error('Error fetching network analysis:', error);
    res.status(500).json({ 
      error: 'Failed to fetch network analysis',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
