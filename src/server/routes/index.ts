import { Router } from 'express';
import healthRouter from './health';
import usersRouter from './users';
import bskyRouter from './bsky';
import jobsRouter from './jobs';
import networkRouter from './network';

const router = Router();

/**
 * API Routes Configuration
 * All routes are prefixed with /api
 */

// Health check endpoint
router.use('/health', healthRouter);

// Users endpoints
router.use('/users', usersRouter);

// BlueSky endpoints
router.use('/bsky', bskyRouter);

// Jobs endpoints
router.use('/jobs', jobsRouter);

// Network analysis endpoints
router.use('/network', networkRouter);

export default router;
