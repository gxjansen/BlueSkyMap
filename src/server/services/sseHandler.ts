import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { JobDocument, JobStatus } from '../models/Job';
import jobProcessor from './jobProcessor';

/**
 * Server-Sent Events Handler
 * Manages real-time updates for job progress
 */
class SSEHandler {
  private eventEmitter: EventEmitter;
  private clients: Map<string, Response>;

  constructor() {
    this.eventEmitter = new EventEmitter();
    this.clients = new Map();
    console.log('SSE Handler initialized');
  }

  /**
   * Handle new SSE connection
   */
  handleConnection = (req: Request, res: Response) => {
    const clientId = req.params.clientId;

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Store client connection
    this.clients.set(clientId, res);

    // Handle client disconnect
    req.on('close', () => {
      this.clients.delete(clientId);
      console.log(`[SSEHandler] Client ${clientId} disconnected`);
    });

    console.log(`[SSEHandler] Client ${clientId} connected`);
  };

  /**
   * Send update to specific client
   */
  sendUpdate = (clientId: string, data: any) => {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(`[SSEHandler] Sending update to client ${clientId}:`, data);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } else {
      console.log(`[SSEHandler] Client ${clientId} not found for update:`, data);
    }
  };

  /**
   * Send update to all clients
   */
  broadcastUpdate = (data: any) => {
    console.log(`[SSEHandler] Broadcasting update to ${this.clients.size} clients:`, data);
    this.clients.forEach((client, clientId) => {
      try {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (error) {
        console.error(`[SSEHandler] Error sending update to client ${clientId}:`, error);
        // Remove client if we can't write to it
        this.clients.delete(clientId);
      }
    });
  };

  /**
   * Update job progress
   */
  updateJobProgress = (jobId: string, progress: any) => {
    console.log(`[SSEHandler] Updating job progress for ${jobId}:`, progress);
    this.broadcastUpdate({
      type: 'jobProgress',
      jobId,
      progress
    });
  };

  /**
   * Update job status
   */
  updateJobStatus = (jobId: string, status: JobStatus) => {
    console.log(`[SSEHandler] Updating job status for ${jobId}:`, status);
    this.broadcastUpdate({
      type: 'jobStatus',
      jobId,
      status
    });
  };
}

// Create and export singleton instance
const sseHandler = new SSEHandler();
export default sseHandler;
