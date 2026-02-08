/**
 * Server entry point
 * Loads configuration and starts HTTP server
 */

import { getConfig } from './config.js';
import { createApp } from './server.js';

// Load and validate configuration (fails fast if invalid)
const config = getConfig();

// Create Express app
const app = createApp(config);

// Start server
app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
  console.log(`Target value: "${config.targetValue}"`);
  console.log(`Replacement value: "${config.replacementValue}"`);
  console.log(`Default replacement limit: ${config.defaultReplacementLimit}`);
  console.log(`Max nesting depth: ${config.maxNestingDepth}`);
});
