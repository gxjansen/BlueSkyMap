import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bskymaps';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Establishes connection to MongoDB database
 */
export async function connectToDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    // Set up connection event handlers
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected.');
    });

    // Development mode specific logging
    if (NODE_ENV === 'development') {
      mongoose.set('debug', true);
    }
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    if (NODE_ENV === 'production') {
      process.exit(1);
    }
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (err) {
    console.error('Error during MongoDB connection closure:', err);
    process.exit(1);
  }
});

// Export the mongoose instance for use in models
export { mongoose };
