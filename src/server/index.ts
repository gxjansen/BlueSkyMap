import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

// Import route handlers
import healthRoutes from './routes/health';
import networkRoutes from './routes/network';
import jobRoutes from './routes/jobs';
import bskyRoutes from './routes/bsky';
import userRoutes from './routes/users';

// Import configuration and utilities
import { SERVER_PORT, MONGODB_URI } from './config';
import { validateConfig } from './services/atproto/index';
import { PortManager } from './utils/portManager';

// Import job processors and services
import jobProcessor from './services/jobProcessor';
import networkAnalyzer from './services/network';

// Load environment variables
dotenv.config();

// Create Express application
const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(morgan('dev')); // Logging middleware

// Routes with API prefix
app.use('/api/health', healthRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/bsky', bskyRoutes);
app.use('/api/users', userRoutes);

// Database connection
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Validate AT Protocol configuration
validateConfig();

// Register job handlers
console.log('[Server] Registering network analyzer handler with job processor');
networkAnalyzer.registerHandler(jobProcessor);

// Port management
const portManager = new PortManager(SERVER_PORT, 'backend');

// Start server
async function startServer() {
  try {
    const port = await portManager.ensurePortAvailable();
    
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down server...');
      await portManager.releasePort();
      server.close(() => {
        mongoose.connection.close()
          .then(() => {
            console.log('MongoDB connection closed');
            process.exit(0);
          })
          .catch((err) => {
            console.error('Error closing MongoDB connection:', err);
            process.exit(1);
          });
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
