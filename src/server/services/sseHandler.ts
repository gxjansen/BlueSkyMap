import { Response } from 'express';
import { JobDocument } from '../models/Job';
import jobProcessor from './jobProcessor';

class SSEHandler {
  private clients: Map<string, Set<Response>>;

  constructor() {
    this.clients = new Map();
    this.setupJobProcessorListeners();
  }

  /**
   * Add a new client connection for a specific user
   */
  addClient(userId: string, res: Response): void {
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Initialize heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write('event: heartbeat\ndata: {}\n\n');
    }, 30000);

    // Clean up on client disconnect
    res.on('close', () => {
      clearInterval(heartbeat);
      this.removeClient(userId, res);
    });

    // Add client to the map
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)?.add(res);

    // Send initial connection confirmation
    this.sendEventToClient(res, 'connected', { message: 'SSE connection established' });
  }

  /**
   * Remove a client connection
   */
  private removeClient(userId: string, res: Response): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  /**
   * Set up listeners for job processor events
   */
  private setupJobProcessorListeners(): void {
    jobProcessor.on('jobCreated', (job: JobDocument) => {
      this.sendEventToUser(job.userId, 'jobCreated', job);
    });

    jobProcessor.on('jobStarted', (job: JobDocument) => {
      this.sendEventToUser(job.userId, 'jobStarted', job);
    });

    jobProcessor.on('jobProgress', (job: JobDocument) => {
      this.sendEventToUser(job.userId, 'jobProgress', job);
    });

    jobProcessor.on('jobCompleted', (job: JobDocument) => {
      this.sendEventToUser(job.userId, 'jobCompleted', job);
    });

    jobProcessor.on('jobFailed', (job: JobDocument) => {
      this.sendEventToUser(job.userId, 'jobFailed', job);
    });

    jobProcessor.on('jobRetrying', (job: JobDocument) => {
      this.sendEventToUser(job.userId, 'jobRetrying', job);
    });
  }

  /**
   * Send an event to all clients for a specific user
   */
  private sendEventToUser(userId: string, event: string, data: any): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.forEach(client => {
        this.sendEventToClient(client, event, data);
      });
    }
  }

  /**
   * Send an event to a specific client
   */
  private sendEventToClient(res: Response, event: string, data: any): void {
    const eventData = JSON.stringify(data);
    res.write(`event: ${event}\ndata: ${eventData}\n\n`);
  }

  /**
   * Get the number of connected clients for a user
   */
  getClientCount(userId: string): number {
    return this.clients.get(userId)?.size || 0;
  }

  /**
   * Get total number of connected clients
   */
  getTotalClientCount(): number {
    let total = 0;
    for (const clients of this.clients.values()) {
      total += clients.size;
    }
    return total;
  }
}

// Create and export singleton instance
const sseHandler = new SSEHandler();
export default sseHandler;
