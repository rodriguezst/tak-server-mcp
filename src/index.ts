#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import pino from 'pino';
import { getConfig } from './config/index';
import { TAKServerClient } from './clients/tak-server';
import { toolRegistry } from './tools/registry';
import { createHttpTransport } from './transports/http';
import { createSSETransport } from './transports/sse';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

async function main() {
  const config = getConfig();
  logger.info('Starting TAK Server MCP...');

  // Initialize TAK Server client
  const takClient = new TAKServerClient({
    url: config.takServer.url,
    apiToken: config.takServer.apiToken,
    clientCert: config.takServer.clientCert,
    clientKey: config.takServer.clientKey,
    verifySsl: config.takServer.verifySsl
  });

  // Test connection
  try {
    await takClient.testConnection();
    logger.info('Successfully connected to TAK Server');
  } catch (error) {
    logger.error('Failed to connect to TAK Server:', error);
    process.exit(1);
  }

  // Create MCP server
  const server = new Server(
    {
      name: 'tak-server-mcp',
      vendor: 'skyfi',
      version: '0.1.0',
      description: 'Model Context Protocol server for TAK Server integration'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Register tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = toolRegistry.getEnabledTools(config.tools.enabledTools);
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolRegistry.getTool(request.params.name);
    if (!tool) {
      throw new Error(`Tool not found: ${request.params.name}`);
    }

    try {
      const result = await tool.handler({
        takClient,
        params: request.params.arguments || {},
        logger: logger.child({ tool: request.params.name })
      });

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      logger.error(`Tool execution failed: ${request.params.name}`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  });

  // Select transport based on configuration
  let transport;
  switch (config.mcp.transport) {
    case 'stdio':
      logger.info('Using stdio transport');
      transport = new StdioServerTransport();
      break;
    case 'http':
      logger.info(`Using HTTP transport on port ${config.mcp.port}`);
      transport = await createHttpTransport(server, config);
      break;
    case 'sse':
      logger.info(`Using SSE transport on port ${config.mcp.port}`);
      transport = await createSSETransport(server, config);
      break;
    default:
      throw new Error(`Unknown transport: ${config.mcp.transport}`);
  }

  // Start server
  await server.connect(transport as any);
  logger.info('TAK Server MCP is running');

  // Handle shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await server.close();
    process.exit(0);
  });
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});