import { Anthropic } from '@anthropic-ai/sdk';
import { MCPClient } from '../clients/mcp-client';
import { TAKServerClient } from '../clients/tak-server';
import * as turf from '@turf/turf';
import { EventEmitter } from 'events';
import pino from 'pino';
import chalk from 'chalk';
import prompts from 'prompts';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

interface AgentConfig {
  anthropicApiKey: string;
  mcpServerUrl: string;
  takServerUrl: string;
  takApiToken?: string;
  model?: string;
}

interface TacticalSituation {
  friendlyForces: any[];
  hostileForces: any[];
  unknownForces: any[];
  neutralForces: any[];
  alerts: any[];
  geofences: any[];
  missions: any[];
  lastUpdate: Date;
}

export class GeospatialResearchAgent extends EventEmitter {
  private anthropic: Anthropic;
  private mcpClient: MCPClient;
  private takClient: TAKServerClient;
  private situation: TacticalSituation;
  private monitoring: boolean = false;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    super();
    this.config = config;
    
    // Initialize clients
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey
    });

    this.mcpClient = new MCPClient({
      url: config.mcpServerUrl,
      transport: 'http'
    });

    this.takClient = new TAKServerClient({
      url: config.takServerUrl,
      apiToken: config.takApiToken
    });

    this.situation = {
      friendlyForces: [],
      hostileForces: [],
      unknownForces: [],
      neutralForces: [],
      alerts: [],
      geofences: [],
      missions: [],
      lastUpdate: new Date()
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Geospatial Research Agent...');
    
    // Test connections
    await this.takClient.testConnection();
    await this.mcpClient.connect();
    
    // Load initial situation
    await this.updateSituation();
    
    logger.info('Agent initialized successfully');
  }

  async updateSituation(): Promise<void> {
    logger.debug('Updating tactical situation...');

    try {
      // Get all entities
      const entities = await this.takClient.getEntities();
      
      // Categorize by affiliation
      this.situation.friendlyForces = entities.filter(e => e.type.startsWith('a-f'));
      this.situation.hostileForces = entities.filter(e => e.type.startsWith('a-h'));
      this.situation.unknownForces = entities.filter(e => e.type.startsWith('a-u'));
      this.situation.neutralForces = entities.filter(e => e.type.startsWith('a-n'));
      
      // Get active alerts
      this.situation.alerts = await this.takClient.getAlerts(true);
      
      // Get missions
      this.situation.missions = await this.takClient.getMissions();
      
      this.situation.lastUpdate = new Date();
      
      this.emit('situation-updated', this.situation);
    } catch (error) {
      logger.error('Failed to update situation:', error);
    }
  }

  async startMonitoring(): Promise<void> {
    if (this.monitoring) return;
    
    logger.info('Starting real-time monitoring...');
    this.monitoring = true;

    // Subscribe to CoT events
    await this.takClient.subscribeToCotEvents(
      {
        types: ['a-h-*', 'b-a-o-tbl'], // Hostile forces and emergencies
      },
      (event) => {
        this.handleRealtimeEvent(event);
      }
    );

    // Periodic situation updates
    const updateInterval = setInterval(async () => {
      if (!this.monitoring) {
        clearInterval(updateInterval);
        return;
      }
      await this.updateSituation();
    }, 30000); // Every 30 seconds
  }

  async stopMonitoring(): Promise<void> {
    logger.info('Stopping monitoring...');
    this.monitoring = false;
    await this.takClient.unsubscribe();
  }

  private async handleRealtimeEvent(event: any): Promise<void> {
    logger.info('Real-time event received:', event.type);

    // Check if this is a high-priority event
    if (event.type === 'b-a-o-tbl' || event.type.startsWith('a-h')) {
      const analysis = await this.analyzeEvent(event);
      this.emit('critical-event', { event, analysis });
    }
  }

  async analyzeEvent(event: any): Promise<string> {
    const tools = await this.mcpClient.listTools();
    
    const response = await this.anthropic.messages.create({
      model: this.config.model || 'claude-3-opus-20240229',
      max_tokens: 1024,
      tools: tools,
      messages: [
        {
          role: 'user',
          content: `Analyze this TAK event and provide assessment:
          
Event Type: ${event.type}
Location: ${event.point.lat}, ${event.point.lon}
Time: ${event.time}
Callsign: ${event.detail?.contact?.callsign || 'Unknown'}

Current situation summary:
- Friendly forces: ${this.situation.friendlyForces.length}
- Hostile forces: ${this.situation.hostileForces.length}
- Active alerts: ${this.situation.alerts.length}

Provide:
1. Event classification and threat level
2. Potential impact on friendly forces
3. Recommended actions`
        }
      ]
    });

    return (response.content[0] as any).text;
  }

  async performGeospatialAnalysis(query: string): Promise<any> {
    logger.info('Performing geospatial analysis:', query);

    const tools = await this.mcpClient.listTools();
    
    const response = await this.anthropic.messages.create({
      model: this.config.model || 'claude-3-opus-20240229',
      max_tokens: 2048,
      tools: tools,
      tool_choice: { type: 'auto' },
      messages: [
        {
          role: 'user' as const,
          content: `You are a geospatial intelligence analyst with access to real-time TAK Server data. 
          Current tactical situation:
          - Friendly forces: ${this.situation.friendlyForces.length}
          - Hostile forces: ${this.situation.hostileForces.length}
          - Unknown forces: ${this.situation.unknownForces.length}
          - Active alerts: ${this.situation.alerts.length}
          - Last update: ${this.situation.lastUpdate.toISOString()}
          
          Use the available tools to gather data and provide detailed analysis.`
        },
        {
          role: 'user',
          content: query
        }
      ]
    });

    // Process tool calls
    const toolResults = [];
    for (const content of response.content) {
      if (content.type === 'tool_use') {
        const result = await this.mcpClient.callTool(content.name, content.input);
        toolResults.push({ tool: content.name, result });
      }
    }

    return {
      analysis: response.content.find(c => c.type === 'text')?.text,
      toolResults,
      timestamp: new Date()
    };
  }

  async generateSituationReport(): Promise<string> {
    logger.info('Generating situation report...');

    const response = await this.anthropic.messages.create({
      model: this.config.model || 'claude-3-opus-20240229',
      max_tokens: 4096,
      messages: [
        {
          role: 'user' as const,
          content: 'You are a military intelligence analyst. Generate a comprehensive situation report (SITREP) based on the current tactical data.'
        },
        {
          role: 'user',
          content: `Generate a detailed SITREP based on this data:

FRIENDLY FORCES (${this.situation.friendlyForces.length} total):
${JSON.stringify(this.situation.friendlyForces.slice(0, 5), null, 2)}

HOSTILE FORCES (${this.situation.hostileForces.length} total):
${JSON.stringify(this.situation.hostileForces.slice(0, 5), null, 2)}

UNKNOWN CONTACTS (${this.situation.unknownForces.length} total):
${JSON.stringify(this.situation.unknownForces.slice(0, 5), null, 2)}

ACTIVE ALERTS:
${JSON.stringify(this.situation.alerts, null, 2)}

CURRENT MISSIONS:
${JSON.stringify(this.situation.missions, null, 2)}

Include:
1. Executive Summary
2. Enemy Forces (composition, disposition, strength)
3. Friendly Forces (status, readiness)
4. Analysis and Assessment
5. Recommended Actions
6. Intelligence Gaps`
        }
      ]
    });

    return (response.content[0] as any).text;
  }

  async runInteractiveDemo(): Promise<void> {
    console.log(chalk.bold.blue('\n🛰️  TAK Server Geospatial Research Agent Demo\n'));
    
    await this.initialize();
    await this.startMonitoring();

    const demos = [
      {
        title: 'Threat Detection & Analysis',
        value: 'threat-detection',
        description: 'Identify and analyze potential threats in an area'
      },
      {
        title: 'Pattern Recognition',
        value: 'pattern-recognition',
        description: 'Detect movement patterns and anomalies'
      },
      {
        title: 'Geofence Monitoring',
        value: 'geofence',
        description: 'Create geofences and monitor breaches'
      },
      {
        title: 'Situation Report',
        value: 'sitrep',
        description: 'Generate comprehensive situation report'
      },
      {
        title: 'Real-time Monitoring',
        value: 'realtime',
        description: 'Monitor live events with AI analysis'
      },
      {
        title: 'Custom Query',
        value: 'custom',
        description: 'Ask any geospatial question'
      }
    ];

    while (true) {
      const { demo } = await prompts({
        type: 'select',
        name: 'demo',
        message: 'Select a demo:',
        choices: demos,
        initial: 0
      });

      if (!demo) break;

      switch (demo) {
        case 'threat-detection':
          await this.runThreatDetectionDemo();
          break;
        case 'pattern-recognition':
          await this.runPatternRecognitionDemo();
          break;
        case 'geofence':
          await this.runGeofenceDemo();
          break;
        case 'sitrep':
          await this.runSitrepDemo();
          break;
        case 'realtime':
          await this.runRealtimeDemo();
          break;
        case 'custom':
          await this.runCustomQueryDemo();
          break;
      }

      const { continue: cont } = await prompts({
        type: 'confirm',
        name: 'continue',
        message: 'Run another demo?',
        initial: true
      });

      if (!cont) break;
    }

    await this.stopMonitoring();
    console.log(chalk.green('\n✅ Demo completed. Thank you!\n'));
  }

  private async runThreatDetectionDemo(): Promise<void> {
    console.log(chalk.yellow('\n🎯 Running Threat Detection Demo...\n'));

    const { lat, lon, radius } = await prompts([
      {
        type: 'number',
        name: 'lat',
        message: 'Enter center latitude:',
        initial: 37.7749
      },
      {
        type: 'number',
        name: 'lon',
        message: 'Enter center longitude:',
        initial: -122.4194
      },
      {
        type: 'number',
        name: 'radius',
        message: 'Enter search radius (km):',
        initial: 50
      }
    ]);

    const analysis = await this.performGeospatialAnalysis(
      `Identify all potential threats within ${radius}km of coordinates ${lat}, ${lon}. 
      Analyze hostile forces, unknown contacts, and any emergency signals. 
      Assess threat levels and recommend defensive measures.`
    );

    console.log(chalk.bold('\n📊 Analysis Results:\n'));
    console.log(analysis.analysis);

    if (analysis.toolResults.length > 0) {
      console.log(chalk.bold('\n🔧 Data Sources Used:\n'));
      analysis.toolResults.forEach((result: any) => {
        console.log(chalk.cyan(`- ${result.tool}`));
      });
    }
  }

  private async runPatternRecognitionDemo(): Promise<void> {
    console.log(chalk.yellow('\n🔍 Running Pattern Recognition Demo...\n'));

    const analysis = await this.performGeospatialAnalysis(
      `Analyze movement patterns of all tracked entities over the past hour. 
      Identify any unusual behavior, formation changes, or coordinated movements. 
      Look for patterns that might indicate tactical maneuvers or threats.`
    );

    console.log(chalk.bold('\n📊 Pattern Analysis:\n'));
    console.log(analysis.analysis);
  }

  private async runGeofenceDemo(): Promise<void> {
    console.log(chalk.yellow('\n🚧 Running Geofence Demo...\n'));

    const { name, lat, lon, radius } = await prompts([
      {
        type: 'text',
        name: 'name',
        message: 'Enter geofence name:',
        initial: 'Restricted Zone Alpha'
      },
      {
        type: 'number',
        name: 'lat',
        message: 'Enter center latitude:',
        initial: 37.7749
      },
      {
        type: 'number',
        name: 'lon',
        message: 'Enter center longitude:',
        initial: -122.4194
      },
      {
        type: 'number',
        name: 'radius',
        message: 'Enter radius (meters):',
        initial: 5000
      }
    ]);

    // Create geofence
    const geofence = await this.mcpClient.callTool('tak_create_geofence', {
      name,
      center: [lat, lon],
      radius,
      alertOnEntry: true,
      alertOnExit: true,
      monitorTypes: ['a-h-*', 'a-u-*'] // Hostile and unknown
    });

    console.log(chalk.green(`\n✅ Geofence "${name}" created successfully!\n`));

    // Monitor for 30 seconds
    console.log(chalk.cyan('Monitoring geofence for 30 seconds...\n'));
    
    let breaches = 0;
    const monitor = setInterval(async () => {
      const events = await this.mcpClient.callTool('tak_check_geofence', {
        geofenceId: geofence.id
      });
      
      if (events.breaches && events.breaches.length > 0) {
        breaches += events.breaches.length;
        console.log(chalk.red(`⚠️  BREACH DETECTED: ${events.breaches.length} entities entered geofence!`));
        
        for (const breach of events.breaches) {
          const analysis = await this.analyzeEvent(breach);
          console.log(chalk.yellow(`\nBreach Analysis:\n${analysis}\n`));
        }
      }
    }, 5000);

    await new Promise(resolve => setTimeout(resolve, 30000));
    clearInterval(monitor);

    console.log(chalk.bold(`\n📊 Monitoring Summary: ${breaches} total breaches detected\n`));
  }

  private async runSitrepDemo(): Promise<void> {
    console.log(chalk.yellow('\n📋 Generating Situation Report...\n'));

    const sitrep = await this.generateSituationReport();
    
    console.log(chalk.bold('SITUATION REPORT\n'));
    console.log(chalk.gray('═'.repeat(60)));
    console.log(sitrep);
    console.log(chalk.gray('═'.repeat(60)));
  }

  private async runRealtimeDemo(): Promise<void> {
    console.log(chalk.yellow('\n📡 Starting Real-time Monitoring Demo...\n'));
    console.log(chalk.cyan('Monitoring for critical events for 60 seconds...\n'));

    let eventCount = 0;

    const eventHandler = (data: any) => {
      eventCount++;
      console.log(chalk.red(`\n🚨 CRITICAL EVENT DETECTED:`));
      console.log(chalk.yellow(`Type: ${data.event.type}`));
      console.log(chalk.yellow(`Location: ${data.event.point.lat}, ${data.event.point.lon}`));
      console.log(chalk.yellow(`Time: ${new Date(data.event.time).toLocaleString()}`));
      console.log(chalk.bold('\nAI Analysis:'));
      console.log(data.analysis);
      console.log(chalk.gray('─'.repeat(60)));
    };

    this.on('critical-event', eventHandler);

    // Simulate some events for demo
    setTimeout(() => {
      this.emit('critical-event', {
        event: {
          type: 'a-h-A',
          point: { lat: 37.8, lon: -122.4 },
          time: new Date(),
          detail: { contact: { callsign: 'HOSTILE-1' } }
        },
        analysis: 'Hostile aircraft detected entering monitored airspace. Recommend immediate defensive posture.'
      });
    }, 5000);

    await new Promise(resolve => setTimeout(resolve, 60000));
    
    this.off('critical-event', eventHandler);
    
    console.log(chalk.bold(`\n📊 Monitoring Summary: ${eventCount} critical events detected\n`));
  }

  private async runCustomQueryDemo(): Promise<void> {
    console.log(chalk.yellow('\n💬 Custom Query Demo\n'));

    const { query } = await prompts({
      type: 'text',
      name: 'query',
      message: 'Enter your geospatial query:',
      initial: 'What is the current disposition of all forces within 100km of our position?'
    });

    console.log(chalk.cyan('\n🔍 Processing query...\n'));

    const analysis = await this.performGeospatialAnalysis(query);

    console.log(chalk.bold('\n📊 Analysis Results:\n'));
    console.log(analysis.analysis);

    if (analysis.toolResults.length > 0) {
      console.log(chalk.bold('\n🔧 Data Sources Used:\n'));
      analysis.toolResults.forEach((result: any) => {
        console.log(chalk.cyan(`- ${result.tool}`));
        if (result.result.summary) {
          console.log(chalk.gray(`  Summary: ${JSON.stringify(result.result.summary, null, 2)}`));
        }
      });
    }
  }
}

// Demo runner
if (require.main === module) {
  const agent = new GeospatialResearchAgent({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000',
    takServerUrl: process.env.TAK_SERVER_URL || '',
    takApiToken: process.env.TAK_SERVER_API_TOKEN
  });

  agent.runInteractiveDemo().catch(console.error);
}