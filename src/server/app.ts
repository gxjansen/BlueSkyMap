import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import routes from './routes';
import jobProcessor from './services/jobProcessor';
import atprotoService from './services/atproto';
import networkAnalyzer from './services/networkAnalyzer';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bskymaps';
    await mongoose.connect(mongoUri);
    console.log('Successfully connected to MongoDB.');
    return true;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    return false;
  }
}

// Initialize AT Protocol service
async function initializeATProtocol() {
  try {
    await atprotoService.initialize();
    console.log('AT Protocol service initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize AT Protocol service:', error);
    return false;
  }
}

// Initialize job processor
function initializeJobProcessor() {
  try {
    // Register network analyzer
    networkAnalyzer.registerHandler(jobProcessor);
    console.log('Network analyzer registered for job type: networkAnalysis');

    // Start job processor
    jobProcessor.start();
    console.log('Job processor started');
    return true;
  } catch (error) {
    console.error('Failed to initialize job processor:', error);
    return false;
  }
}

// Start server
async function startServer() {
  try {
    // Connect to MongoDB
    const mongoConnected = await connectToMongoDB();
    if (!mongoConnected) {
      throw new Error('Failed to connect to MongoDB');
    }
    console.log('MongoDB connected successfully');

    // Initialize AT Protocol service
    const atprotoInitialized = await initializeATProtocol();
    if (!atprotoInitialized) {
      throw new Error('Failed to initialize AT Protocol service');
    }

    // Initialize job processor
    const jobProcessorInitialized = initializeJobProcessor();
    if (!jobProcessorInitialized) {
      throw new Error('Failed to initialize job processor');
    }

    // Start Express server
    const server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
        process.exit(1);
      } else {
        console.error('Server error:', error);
      }
    });

    // Handle process termination
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...');
      server.close(async () => {
        console.log('Server closed');
        await mongoose.connection.close();
        console.log('MongoDB connection closed');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
