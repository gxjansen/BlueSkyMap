import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { format } from 'date-fns';
import routes from './routes';
import sseHandler from './services/sseHandler';

// Custom error class for authentication errors
export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

const app = express();

// Create logs directory if it doesn't exist
const logsDir = join(__dirname, '../../logs');
try {
  require('fs').mkdirSync(logsDir);
} catch (err) {
  if ((err as any).code !== 'EEXIST') {
    console.error('Error creating logs directory:', err);
  }
}

// Create a write stream for logging
const accessLogStream = createWriteStream(
  join(logsDir, `server-${format(new Date(), 'yyyy-MM-dd')}.log`),
  { flags: 'a' }
);

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Logging middleware
morgan.token('body', (req: any) => JSON.stringify(req.body));
app.use(morgan(':method :url :status :response-time ms - :body', { stream: accessLogStream }));
app.use(morgan('dev')); // Console logging

// Custom logging middleware for detailed request/response logging
app.use((req, res, next) => {
  const oldWrite = res.write;
  const oldEnd = res.end;
  const chunks: Buffer[] = [];

  res.write = function(chunk: any) {
    chunks.push(Buffer.from(chunk));
    return oldWrite.apply(res, arguments as any);
  };

  res.end = function(chunk: any) {
    if (chunk) {
      chunks.push(Buffer.from(chunk));
    }
    const responseBody = Buffer.concat(chunks).toString('utf8');

    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      responseStatus: res.statusCode,
      responseHeaders: res.getHeaders(),
      responseBody: responseBody.substring(0, 1000) // Limit response body logging
    };

    accessLogStream.write(`${JSON.stringify(logEntry)}\n`);
    return oldEnd.apply(res, arguments as any);
  };

  next();
});

// SSE endpoint
app.get('/api/events/:clientId', sseHandler.handleConnection);

// API routes
app.use('/api', routes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  accessLogStream.write(`Error: ${err.stack}\n`);

  // Handle authentication errors
  if (err instanceof AuthenticationError || err.message.includes('Authentication failed')) {
    return res.status(401).json({
      error: 'Authentication Failed',
      message: 'BlueSky API authentication failed. Please configure valid credentials in the server\'s .env file.',
      details: err.message
    });
  }

  // Handle rate limiting errors
  if (err.message.includes('Rate Limited')) {
    return res.status(429).json({
      error: 'Rate Limited',
      message: err.message
    });
  }

  // Handle other known errors
  if (err instanceof Error) {
    return res.status(500).json({
      error: err.name,
      message: err.message
    });
  }

  // Handle unknown errors
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
