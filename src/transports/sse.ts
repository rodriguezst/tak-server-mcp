import express, { Request, Response } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { ServerTransport } from '@modelcontextprotocol/sdk/server/types.js';
import { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import { Config } from '../config/index';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

interface SSEClient {
  id: string;
  response: Response;
  lastActivity: Date;
}

export class SSEServerTransport {
  private server: Server;
  private app: express.Application;
  private config: Config;
  private clients: Map<string, SSEClient> = new Map();
  private cleanupInterval?: NodeJS.Timer;

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.startCleanup();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-ID');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.info({ method: req.method, path: req.path }, 'SSE request');
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'tak-server-mcp-sse', 
        version: '0.1.0',
        clients: this.clients.size 
      });
    });

    // SSE endpoint
    this.app.get('/sse', (req, res) => {
      const clientId = req.headers['x-client-id'] as string || uuidv4();
      
      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Client-ID': clientId
      });

      // Register client
      const client: SSEClient = {
        id: clientId,
        response: res,
        lastActivity: new Date()
      };
      this.clients.set(clientId, client);

      // Send initial connection event
      this.sendEvent(client, 'connected', { clientId });

      // Keep connection alive
      const keepAlive = setInterval(() => {
        res.write(':keepalive\n\n');
      }, 30000);

      // Handle client disconnect
      req.on('close', () => {
        clearInterval(keepAlive);
        this.clients.delete(clientId);
        logger.info(`SSE client disconnected: ${clientId}`);
      });

      logger.info(`SSE client connected: ${clientId}`);
    });

    // Request endpoint
    this.app.post('/sse/request', async (req, res) => {
      const clientId = req.headers['x-client-id'] as string;
      
      if (!clientId || !this.clients.has(clientId)) {
        return res.status(400).json({ error: 'Invalid or missing client ID' });
      }

      try {
        const request = req.body as JSONRPCRequest;
        const client = this.clients.get(clientId)!;
        client.lastActivity = new Date();

        logger.debug({ method: request.method, clientId }, 'Processing SSE request');

        // Process request
        const response = await this.handleRequest(request);
        
        // Send response via SSE
        this.sendEvent(client, 'response', response);
        
        // Also return in HTTP response for acknowledgment
        res.json({ success: true, id: request.id });
      } catch (error) {
        logger.error('Error handling SSE request:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Internal error'
        });
      }
    });

    // Subscribe to specific events (for real-time TAK updates)
    this.app.post('/sse/subscribe', (req, res) => {
      const clientId = req.headers['x-client-id'] as string;
      
      if (!clientId || !this.clients.has(clientId)) {
        return res.status(400).json({ error: 'Invalid or missing client ID' });
      }

      const { events } = req.body;
      const client = this.clients.get(clientId)!;
      
      // Store subscription preferences (would be used by TAK event handlers)
      (client as any).subscriptions = events;
      
      res.json({ success: true, subscribed: events });
    });
  }

  private sendEvent(client: SSEClient, event: string, data: any) {
    try {
      const message = [
        `event: ${event}`,
        `data: ${JSON.stringify(data)}`,
        `id: ${Date.now()}`,
        '', ''
      ].join('\n');
      
      client.response.write(message);
    } catch (error) {
      logger.error(`Failed to send SSE event to client ${client.id}:`, error);
      this.clients.delete(client.id);
    }
  }

  private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    return new Promise((resolve) => {
      const mockConnection = {
        send: (response: JSONRPCResponse) => {
          resolve(response);
        }
      };

      (this.server as any).handleRequest(request, mockConnection);
    });
  }

  // Broadcast to all clients (useful for TAK events)
  public broadcast(event: string, data: any) {
    for (const client of this.clients.values()) {
      this.sendEvent(client, event, data);
    }
  }

  // Broadcast to specific clients based on subscriptions
  public broadcastToSubscribers(event: string, data: any, filter?: (client: SSEClient) => boolean) {
    for (const client of this.clients.values()) {
      if (!filter || filter(client)) {
        this.sendEvent(client, event, data);
      }
    }
  }

  private startCleanup() {
    // Clean up inactive clients every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      const timeout = 5 * 60 * 1000; // 5 minutes

      for (const [id, client] of this.clients.entries()) {
        if (now.getTime() - client.lastActivity.getTime() > timeout) {
          logger.info(`Cleaning up inactive SSE client: ${id}`);
          try {
            client.response.end();
          } catch (error) {
            // Client might already be disconnected
          }
          this.clients.delete(id);
        }
      }
    }, 60000); // Check every minute
  }

  async start(): Promise<void> {
    const port = this.config.mcp.port || 3001;
    
    return new Promise((resolve, reject) => {
      this.app.listen(port, () => {
        logger.info(`SSE transport listening on port ${port}`);
        resolve();
      }).on('error', reject);
    });
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval as any);
    }

    // Close all client connections
    for (const client of this.clients.values()) {
      try {
        this.sendEvent(client, 'shutdown', { message: 'Server shutting down' });
        client.response.end();
      } catch (error) {
        // Ignore errors during shutdown
      }
    }
    
    this.clients.clear();
    logger.info('SSE transport closed');
  }
}

export async function createSSETransport(server: Server, config: Config): Promise<SSEServerTransport> {
  const transport = new SSEServerTransport(server, config);
  await transport.start();
  return transport;
}