import { Router } from 'express';
import type { Request, Response } from 'express';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import Job, { JobType } from '../models/Job';
import jobProcessor from '../services/jobProcessor';
import sseHandler from '../services/sseHandler';

const router = Router();

// Apply rate limiting to all job routes
router.use(rateLimiterMiddleware);

/**
 * POST /api/jobs
 * Create a new job
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, data, priority } = req.body;
    const userId = req.body.userId; // In production, get from auth context

    if (!Object.values(JobType).includes(type)) {
      return res.status(400).json({ error: 'Invalid job type' });
    }

    const job = await jobProcessor.createJob(type, userId, data, priority);
    res.status(201).json(job);
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ 
      error: 'Failed to create job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs/:id
 * Get job status and details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ 
      error: 'Failed to fetch job',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs/user/:userId
 * Get all jobs for a user
 */
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const jobs = await jobProcessor.getUserJobs(req.params.userId);
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching user jobs:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/jobs/events/:userId
 * Subscribe to job events via SSE
 */
router.get('/events/:userId', (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    sseHandler.addClient(userId, res);
  } catch (error) {
    console.error('Error setting up SSE:', error);
    res.status(500).json({ 
      error: 'Failed to setup event stream',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
