import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TAKServerClient } from '../clients/tak-server';
import { Logger } from 'pino';

// Import all tools
import { getCotEventsTool } from './cot/get-events';
import { sendCotEventTool } from './cot/send-event';
import { subscribeEventsTool } from './cot/subscribe-events';
import { getEntitiesTool } from './entities/get-entities';
import { spatialQueryTool } from './geospatial/spatial-query';
import { calculateDistanceTool } from './geospatial/calculate-distance';
import { findNearestTool } from './geospatial/find-nearest';
import { createGeofenceTool } from './geospatial/create-geofence';
import { analyzeMovementTool } from './geospatial/analyze-movement';
// import { getMissionsTool } from './missions/get-missions';
import { getAlertsTool } from './alerts/get-alerts';
import { sendEmergencyTool } from './alerts/send-emergency';
// import { manageDataPackagesTool } from './data-packages/manage-data-packages';

export interface ToolContext {
  takClient: TAKServerClient;
  params: any;
  logger: Logger;
}

export interface TAKTool extends Tool {
  handler: (context: ToolContext) => Promise<any>;
  category: 'cot' | 'entities' | 'missions' | 'geospatial' | 'alerts' | 'data-packages';
  requiresAuth?: boolean;
  requiresWrite?: boolean;
}

class ToolRegistry {
  private tools: Map<string, TAKTool> = new Map();

  constructor() {
    // Register all tools
    this.registerTool(getCotEventsTool);
    this.registerTool(sendCotEventTool);
    this.registerTool(subscribeEventsTool);
    this.registerTool(getEntitiesTool);
    this.registerTool(spatialQueryTool);
    this.registerTool(calculateDistanceTool);
    this.registerTool(findNearestTool);
    this.registerTool(createGeofenceTool);
    this.registerTool(analyzeMovementTool);
    // this.registerTool(getMissionsTool);
    this.registerTool(getAlertsTool);
    this.registerTool(sendEmergencyTool);
    // this.registerTool(manageDataPackagesTool);
  }

  registerTool(tool: TAKTool): void {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): TAKTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): TAKTool[] {
    return Array.from(this.tools.values());
  }

  getEnabledTools(enabledList?: string[]): Tool[] {
    const tools = this.getAllTools();
    
    if (!enabledList || enabledList.length === 0) {
      // Return all tools if no filter specified
      return tools;
    }

    // Filter to only enabled tools
    return tools.filter(tool => enabledList.includes(tool.name));
  }

  getToolsByCategory(category: string): TAKTool[] {
    return this.getAllTools().filter(tool => tool.category === category);
  }

  getReadOnlyTools(): TAKTool[] {
    return this.getAllTools().filter(tool => !tool.requiresWrite);
  }
}

export const toolRegistry = new ToolRegistry();