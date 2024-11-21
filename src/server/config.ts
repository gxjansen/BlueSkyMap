// src/server/config.ts

// Default ports with fallbacks
export const SERVER_PORT = parseInt(process.env.SERVER_PORT || '3003', 10);
export const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT || '5173', 10); // Vite's default port

// MongoDB connection URI
export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bskyMaps2';

// Port configuration
export const PORT_CONFIG = {
  maxRetries: 5,
  portRange: 10, // Will try ports in range [port, port + portRange]
};
