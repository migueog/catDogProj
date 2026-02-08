/**
 * Type definitions for the value replacement service
 */

/**
 * Configuration for the replacement operation
 */
export interface ReplacementConfig {
  /** The string value to search for (exact match, case-sensitive) */
  targetValue: string;
  /** The string value to replace with */
  replacementValue: string;
  /** Maximum number of replacements to perform (stops early when reached) */
  limit: number;
  /** Maximum nesting depth allowed in JSON structures */
  maxDepth: number;
}

/**
 * Result of a replacement operation
 */
export interface ReplacementResult {
  /** The transformed data structure */
  data: unknown;
  /** Number of replacements actually made */
  replacementsMade: number;
}

/**
 * Application configuration loaded from environment
 */
export interface AppConfig {
  /** HTTP server port */
  port: number;
  /** Default target value for replacement */
  targetValue: string;
  /** Default replacement value */
  replacementValue: string;
  /** Default replacement limit */
  defaultReplacementLimit: number;
  /** Maximum JSON nesting depth */
  maxNestingDepth: number;
}
