import express, { Request, Response, NextFunction } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { ServerTransport } from '@modelcontextprotocol/sdk/server/types.js';
import { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import jwt from 'jsonwebtoken';
import { Config } from '../config/index';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

export class HttpServerTransport {
  private server: Server;
  private app: express.Application;
  private config: Config;

  constructor(server: Server, config: Config) {
    this.server = server;
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Authentication middleware
    if (this.config.mcp.auth?.enabled) {
      this.app.use(this.authMiddleware.bind(this));
    }

    // Request logging
    this.app.use((req, res, next) => {
      logger.info({ method: req.method, path: req.path }, 'HTTP request');
      next();
    });
  }

  private authMiddleware(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const authConfig = this.config.mcp.auth!;

    switch (authConfig.method) {
      case 'oauth2':
        const token = authHeader.replace('Bearer ', '');
        try {
          // Verify JWT token (would need proper OAuth2 validation in production)
          jwt.verify(token, authConfig.oauth!.clientSecret);
          next();
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        break;

      case 'apikey':
        if (authHeader !== `Bearer ${process.env.MCP_API_KEY}`) {
          return res.status(401).json({ error: 'Invalid API key' });
        }
        next();
        break;

      case 'basic':
        // Basic auth implementation
        const base64Credentials = authHeader.split(' ')[1];
        const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
        const [username, password] = credentials.split(':');
        
        if (username !== process.env.MCP_USERNAME || password !== process.env.MCP_PASSWORD) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }
        next();
        break;

      default:
        next();
    }
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'tak-server-mcp', version: '0.1.0' });
    });

    // MCP endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        const request = req.body as JSONRPCRequest;
        logger.debug({ method: request.method }, 'Processing RPC request');

        // Forward to MCP server
        const response = await this.handleRequest(request);
        res.json(response);
      } catch (error) {
        logger.error('Error handling request:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : 'Internal error'
          }
        });
      }
    });

    // Batch requests
    this.app.post('/mcp/batch', async (req, res) => {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Batch requests must be an array' });
      }

      try {
        const responses = await Promise.all(
          req.body.map(request => this.handleRequest(request))
        );
        res.json(responses);
      } catch (error) {
        logger.error('Error handling batch request:', error);
        res.status(500).json({ error: 'Batch processing failed' });
      }
    });
  }

  private async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    // The server expects to handle the request directly
    // We need to simulate the transport layer communication
    return new Promise((resolve) => {
      // Create a mock connection that captures the response
      const mockConnection = {
        send: (response: JSONRPCResponse) => {
          resolve(response);
        }
      };

      // Process the request through the server
      (this.server as any).handleRequest(request, mockConnection);
    });
  }

  async start(): Promise<void> {
    const port = this.config.mcp.port || 3000;
    
    return new Promise((resolve, reject) => {
      this.app.listen(port, () => {
        logger.info(`HTTP transport listening on port ${port}`);
        resolve();
      }).on('error', reject);
    });
  }

  async close(): Promise<void> {
    // Express doesn't provide a direct way to close the server
    // In production, you'd keep a reference to the server instance
    logger.info('HTTP transport closing');
  }
}

export async function createHttpTransport(server: Server, config: Config): Promise<HttpServerTransport> {
  const transport = new HttpServerTransport(server, config);
  await transport.start();
  return transport;
}