/**
 * Configuration management with environment variable loading and validation
 * Fails fast at startup if configuration is invalid
 */

import type { AppConfig } from './types.js';

/**
 * Parse and validate port number
 */
function parsePort(value: string | undefined, defaultValue: number): number {
  const port = value ? parseInt(value, 10) : defaultValue;

  if (isNaN(port)) {
    throw new Error('PORT must be a valid number');
  }

  if (port < 1 || port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return port;
}

/**
 * Parse and validate positive integer
 */
function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
  name: string
): number {
  const parsed = value ? parseInt(value, 10) : defaultValue;

  if (isNaN(parsed)) {
    throw new Error(`${name} must be a valid number`);
  }

  if (parsed < 0) {
    throw new Error(`${name} must be >= 0`);
  }

  return parsed;
}

/**
 * Parse and validate depth limit
 */
function parseDepth(value: string | undefined, defaultValue: number): number {
  const depth = value ? parseInt(value, 10) : defaultValue;

  if (isNaN(depth)) {
    throw new Error('MAX_NESTING_DEPTH must be a valid number');
  }

  if (depth < 1) {
    throw new Error('MAX_NESTING_DEPTH must be >= 1');
  }

  return depth;
}

/**
 * Parse and validate string value
 */
function parseString(
  value: string | undefined,
  defaultValue: string,
  name: string
): string {
  const trimmed = (value ?? defaultValue).trim();

  if (trimmed === '') {
    throw new Error(`${name} cannot be empty`);
  }

  return trimmed;
}

/**
 * Load and validate application configuration from environment variables
 * Throws error immediately if any configuration is invalid (fail-fast)
 */
export function getConfig(): AppConfig {
  return {
    port: parsePort(process.env.PORT, 3000),
    targetValue: parseString(process.env.TARGET_VALUE, 'dog', 'TARGET_VALUE'),
    replacementValue: parseString(
      process.env.REPLACEMENT_VALUE,
      'cat',
      'REPLACEMENT_VALUE'
    ),
    defaultReplacementLimit: parsePositiveInt(
      process.env.DEFAULT_REPLACEMENT_LIMIT,
      100,
      'DEFAULT_REPLACEMENT_LIMIT'
    ),
    maxNestingDepth: parseDepth(process.env.MAX_NESTING_DEPTH, 50),
  };
}
