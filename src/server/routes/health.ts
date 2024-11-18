import { Router } from 'express';
import type { Request, Response } from 'express';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint to verify API status
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
  });
});

export default router;
