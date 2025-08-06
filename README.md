# TAK Server MCP (Model Context Protocol)

A Model Context Protocol (MCP) server for integrating TAK Server with AI systems, enabling geospatial-aware deep research and analysis capabilities.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Version](https://img.shields.io/badge/MCP-2024--11--05-blue.svg)](https://modelcontextprotocol.io)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![npm version](https://img.shields.io/npm/v/@skyfi/tak-server-mcp.svg)](https://www.npmjs.com/package/@skyfi/tak-server-mcp)

## 🚀 Features

### Multi-Transport Support
- **stdio** - Standard input/output for CLI integration
- **HTTP+SSE** - Server-Sent Events for web integration
- **WebSocket** - Real-time bidirectional communication

### Complete Tool Suite (11 Tools)

#### 📍 Geospatial Operations
- `tak_spatial_query` - Query entities within geographic areas
- `tak_calculate_distance` - Distance calculations with travel time estimates
- `tak_find_nearest` - Find nearest entities with bearings
- `tak_create_geofence` - Create geofenced areas with alerts
- `tak_analyze_movement` - Track movements and detect anomalies

#### 📡 Real-time Operations
- `tak_get_cot_events` - Retrieve Cursor on Target events
- `tak_send_cot_event` - Send CoT messages
- `tak_subscribe_events` - Subscribe to live event streams
- `tak_get_entities` - Get current entity states

#### 🚨 Mission & Emergency
- `tak_get_missions` - List and manage missions
- `tak_get_alerts` - Retrieve and filter alerts
- `tak_send_emergency` - Send emergency broadcasts
- `tak_manage_data_packages` - Upload/download data packages

### Advanced Features
- 🔐 Multiple authentication methods (OAuth 2.0, API tokens, certificates)
- 📊 H3 hexagonal indexing for spatial queries
- 🗺️ MGRS coordinate conversion
- ⚡ Real-time WebSocket subscriptions
- 💾 Intelligent caching with TTL
- 🔍 Comprehensive error handling

## 📋 Prerequisites

- Node.js >= 18.0.0
- TAK Server instance (one of):
  - [TAK Server](https://tak.gov/) (Official)
  - [FreeTAKServer](https://github.com/FreeTAKTeam/FreeTakServer) (Open Source)
  - [taky](https://github.com/tkuester/taky) (Lightweight, CoT only)

## 🛠️ Installation

### Option 1: Install from NPM (Recommended)
```bash
# Install globally
npm install -g @skyfi/tak-server-mcp

# Or install locally in your project
npm install @skyfi/tak-server-mcp
```

### Option 2: From Source
```bash
git clone https://github.com/optisense/tak-server-mcp.git
cd tak-server-mcp
npm install
npm run build
```

### Option 3: Using Docker
```bash
docker pull skyfi/tak-server-mcp:latest
```

## ⚙️ Configuration

### Environment Variables
```bash
# TAK Server Connection
TAK_SERVER_URL=https://your-tak-server.com
TAK_SERVER_API_TOKEN=your-api-token
TAK_SERVER_CLIENT_CERT=/path/to/cert.pem
TAK_SERVER_CLIENT_KEY=/path/to/key.pem

# MCP Configuration
MCP_TRANSPORT=stdio
MCP_PORT=3000
MCP_AUTH_ENABLED=false
```

### Configuration File
Create a `config.json`:
```json
{
  "takServer": {
    "url": "https://your-tak-server.com",
    "apiToken": "your-token",
    "verifySsl": true
  },
  "mcp": {
    "transport": "stdio",
    "port": 3000
  },
  "tools": {
    "enabledTools": ["tak_get_cot_events", "tak_spatial_query"]
  }
}
```

## 🚀 Quick Start

### 1. With Claude Desktop (Recommended)

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
```json
{
  "mcpServers": {
    "tak-server": {
      "command": "npx",
      "args": ["@skyfi/tak-server-mcp"],
      "env": {
        "TAK_SERVER_URL": "https://your-tak-server.com",
        "TAK_SERVER_API_TOKEN": "your-token"
      }
    }
  }
}
```

### 2. As a CLI Tool
```bash
# Install globally
npm install -g @skyfi/tak-server-mcp

# Run with environment variables
TAK_SERVER_URL=https://your-tak-server.com \
TAK_SERVER_API_TOKEN=your-token \
tak-server-mcp

# Or with a config file
tak-server-mcp --config ./config.json
```

### 3. Programmatic Usage
```javascript
import { TAKServerClient } from '@skyfi/tak-server-mcp';

const client = new TAKServerClient({
  url: 'https://your-tak-server.com',
  apiToken: 'your-token'
});

// Get CoT events
const events = await client.getCotEvents();
console.log(events);

// Send an emergency
await client.sendEmergency({
  type: 'medical',
  location: { lat: 37.7749, lon: -122.4194 },
  message: 'Medical assistance required'
});
```

### 4. With Docker
```bash
docker run -it --rm \
  -e TAK_SERVER_URL=https://your-tak-server.com \
  -e TAK_SERVER_API_TOKEN=your-token \
  skyfi/tak-server-mcp:latest

# Or with config file
tak-server-mcp --config ./config.json
```

## 💡 Common Use Cases

### AI-Powered Situational Awareness
Use with Claude or other AI assistants to:
- Analyze real-time tactical situations
- Generate intelligence reports from TAK data
- Monitor geofenced areas for security breaches
- Track and predict entity movements
- Coordinate emergency responses

### Integration Examples
```javascript
// Example: Monitor a perimeter and alert on breaches
const monitorPerimeter = async () => {
  const client = new TAKServerClient({ /* config */ });
  
  // Create geofence
  await client.createGeofence({
    name: "Secure Zone Alpha",
    shape: { type: "circle", center: [37.7749, -122.4194], radius: 1000 },
    alertLevel: "critical"
  });
  
  // Subscribe to breach events
  await client.subscribeEvents({
    eventTypes: ['geofence-breach'],
    callback: (event) => {
      console.log('BREACH DETECTED:', event);
      // Trigger automated response
    }
  });
};
```

## 📚 Usage Examples

### Calculate Distance Between Points
```json
{
  "tool": "tak_calculate_distance",
  "arguments": {
    "from": { "coordinates": [37.7749, -122.4194] },
    "to": { "coordinates": [37.7849, -122.4094] },
    "units": "kilometers"
  }
}
```

### Find Nearest Friendly Units
```json
{
  "tool": "tak_find_nearest",
  "arguments": {
    "point": { "coordinates": [37.7749, -122.4194] },
    "maxDistance": 5000,
    "entityTypes": ["a-f-*"],
    "maxResults": 5
  }
}
```

### Create Security Geofence
```json
{
  "tool": "tak_create_geofence",
  "arguments": {
    "name": "Base Perimeter",
    "shape": {
      "type": "circle",
      "center": [37.7749, -122.4194],
      "radius": 2000
    },
    "alertLevel": "high",
    "triggers": {
      "onEntry": true,
      "onExit": true
    }
  }
}
```

## 🧪 Testing

### Run Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Test with TAK Server
```bash
# Test connection
./test-all-tools.js

# Run specific tool tests
./test-all-tools.js --tool tak_spatial_query
```

## 🐳 Docker Deployment

### Build Image
```bash
docker build -t tak-server-mcp .
```

### Run Container
```bash
docker run -d \
  --name tak-mcp \
  -e TAK_SERVER_URL=https://tak.example.com \
  -e TAK_SERVER_API_TOKEN=your-token \
  -p 3000:3000 \
  tak-server-mcp
```

### Docker Compose
```yaml
version: '3.8'
services:
  tak-mcp:
    image: skyfi/tak-server-mcp:latest
    environment:
      TAK_SERVER_URL: ${TAK_SERVER_URL}
      TAK_SERVER_API_TOKEN: ${TAK_SERVER_API_TOKEN}
      MCP_TRANSPORT: http
      MCP_PORT: 3000
    ports:
      - "3000:3000"
```

## 🤝 Integration Examples

### With LangChain
```python
from langchain.tools import MCPTool

tak_tool = MCPTool(
    name="tak-server",
    server_url="http://localhost:3000",
    auth_token="your-mcp-token"
)

result = agent.run("Find all units within 10km of coordinates 37.7749, -122.4194")
```

### With Anthropic SDK
```typescript
import { MCPClient } from '@modelcontextprotocol/sdk';

const mcp = new MCPClient({
  serverUrl: 'http://localhost:3000',
  transport: 'http'
});

const tools = await mcp.listTools();
const result = await mcp.callTool('tak_spatial_query', {
  center: [37.7749, -122.4194],
  radius: 10000
});
```

## 🏗️ Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   AI Systems    │────▶│  MCP Server  │────▶│ TAK Server  │
│  (LLMs, Agents) │◀────│              │◀────│             │
└─────────────────┘     └──────────────┘     └─────────────┘
         │                      │                     │
         │                      ▼                     │
         │              ┌──────────────┐              │
         └─────────────▶│ Tool Handlers│◀─────────────┘
                        └──────────────┘
```

## 🔒 Security

- TLS 1.2+ for all communications
- OAuth 2.0 and certificate-based authentication
- Input validation and sanitization
- Rate limiting and access controls
- Audit logging for all operations

## 📖 Documentation

- [API Reference](docs/API.md)
- [Tool Documentation](docs/TOOLS.md)
- [Integration Guide](docs/INTEGRATION.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- TAK Product Center for TAK Server documentation
- Anthropic for the MCP specification
- The open-source geospatial community

## 🔧 Troubleshooting

### Common Issues

**Connection Failed**
```bash
# Check TAK Server is accessible
curl -k https://your-tak-server.com/Marti/api/version

# Verify credentials
TAK_SERVER_URL=... TAK_SERVER_API_TOKEN=... npm run test:connection
```

**Permission Denied**
```bash
# Ensure proper certificate permissions
chmod 600 /path/to/client.key
chmod 644 /path/to/client.pem
```

**Tool Not Found**
```bash
# List available tools
tak-server-mcp --list-tools

# Check if tool is enabled in config
grep "enabledTools" config.json
```

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/optisense/tak-server-mcp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/optisense/tak-server-mcp/discussions)
- **Documentation**: [Wiki](https://github.com/optisense/tak-server-mcp/wiki)
- **Email**: support@skyfi.com

## 🚦 Status

- ✅ All 11 advertised tools implemented
- ✅ Multi-transport support (stdio, HTTP, SSE)
- ✅ Docker support
- ✅ FreeTAKServer compatible
- 🚧 Test coverage in progress
- 🚧 Additional tool development ongoing

---

Made with ❤️ by SkyFi