/**
 * Express HTTP server setup with security middleware and API routes
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import { replaceValues } from './replacer.js';
import type { AppConfig, ReplacementConfig } from './types.js';

/**
 * Create and configure Express application
 * Exports app for testing without starting the server
 */
export function createApp(config: AppConfig): express.Application {
  const app = express();

  // Security middleware (adds various HTTP headers)
  app.use(helmet());

  // Body parser with 1MB limit to prevent memory exhaustion
  app.use(express.json({ limit: '1mb' }));

  /**
   * Health check endpoint
   */
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  /**
   * Transform endpoint - main API functionality
   * Accepts JSON payload and optional ?limit=N query parameter
   */
  app.post('/transform', (req: Request, res: Response) => {
    try {
      // Parse and validate limit from query param
      const limit = parseLimit(req.query.limit, config.defaultReplacementLimit);

      // Build replacement config
      const replacementConfig: ReplacementConfig = {
        targetValue: config.targetValue,
        replacementValue: config.replacementValue,
        limit,
        maxDepth: config.maxNestingDepth,
      };

      // Perform replacement
      const result = replaceValues(req.body, replacementConfig);

      // Return wrapped response with metadata
      res.json({
        data: result.data,
        meta: {
          replacementsMade: result.replacementsMade,
          replacementLimit: limit,
        },
      });
    } catch (error) {
      handleError(error, res);
    }
  });

  /**
   * 404 handler for unknown routes
   */
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  /**
   * Global error handler
   * Catches errors from middleware (JSON parsing, payload size, etc.)
   */
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unexpected error:', err);

    // Handle JSON parsing errors from body-parser
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    // Handle payload too large errors
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Payload too large' });
      return;
    }

    // Default to 500 for unknown errors
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

/**
 * Parse and validate limit query parameter
 */
function parseLimit(
  limitParam: unknown,
  defaultLimit: number
): number {
  // No limit specified, use default
  if (limitParam === undefined) {
    return defaultLimit;
  }

  // Parse as integer
  const limit = parseInt(String(limitParam), 10);

  // Validate
  if (isNaN(limit)) {
    throw new Error('Limit must be a valid number');
  }

  if (limit < 0) {
    throw new Error('Limit must be >= 0');
  }

  return limit;
}

/**
 * Handle errors and send appropriate HTTP response
 * Never leak internal error details to client
 */
function handleError(error: unknown, res: Response): void {
  // Log full error server-side
  console.error('Request error:', error);

  // Send generic error to client
  if (error instanceof Error) {
    // Check for depth limit error
    if (error.message.toLowerCase().includes('depth')) {
      res.status(400).json({ error: 'Maximum nesting depth exceeded' });
      return;
    }

    // Check for limit validation error
    if (error.message.toLowerCase().includes('limit')) {
      res.status(400).json({ error: error.message });
      return;
    }

    // Generic bad request
    res.status(400).json({ error: error.message });
    return;
  }

  // Unknown error type
  res.status(500).json({ error: 'Internal server error' });
}
