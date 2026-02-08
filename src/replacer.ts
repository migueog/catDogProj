/**
 * Core value replacement logic
 * Pure functions with no side effects - immutable transformations only
 */

import type { ReplacementConfig, ReplacementResult } from './types.js';

/**
 * Dangerous keys that should be filtered to prevent prototype pollution
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Type guard to check if a value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Main entry point for value replacement
 * Returns a new structure with replacements applied, never mutates input
 */
export function replaceValues(
  data: unknown,
  config: ReplacementConfig
): ReplacementResult {
  let replacementsMade = 0;

  /**
   * Recursive replacement function with depth tracking
   * Stops early when limit is reached or depth exceeds maxDepth
   */
  function replace(value: unknown, depth: number): unknown {
    // Check depth limit
    if (depth > config.maxDepth) {
      throw new Error(
        `Maximum nesting depth of ${config.maxDepth} exceeded`
      );
    }

    // Stop if limit reached
    if (replacementsMade >= config.limit) {
      return value;
    }

    // Handle strings (only type we replace)
    if (typeof value === 'string') {
      // Decision: Exact match only, case-sensitive (see ADR-001, Decisions 1 & 2)
      // Why: "dog" matches "dog" only, not "Dog", "DOG", or "hotdog"
      // Rationale: Simplicity (O(1) check), predictability, data integrity
      if (value === config.targetValue && replacementsMade < config.limit) {
        replacementsMade++;
        return config.replacementValue;
      }
      return value;
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return replaceInArray(value, depth);
    }

    // Handle plain objects
    if (isPlainObject(value)) {
      return replaceInObject(value, depth);
    }

    // All other types (null, number, boolean, etc.) pass through
    return value;
  }

  /**
   * Replace values in an array
   * Creates a new array, stops early if limit reached
   */
  function replaceInArray(arr: unknown[], depth: number): unknown[] {
    const result: unknown[] = [];

    for (const item of arr) {
      if (replacementsMade >= config.limit) {
        // Decision: Partial success - stop early (see ADR-001, Decision 3)
        // Preserve document structure by copying remaining items unchanged
        // Why: Better than rejecting entire request, single-pass O(n) efficiency
        result.push(item);
      } else {
        result.push(replace(item, depth + 1));
      }
    }

    return result;
  }

  /**
   * Replace values in an object
   * Creates a new object, filters dangerous keys, stops early if limit reached
   */
  function replaceInObject(
    obj: Record<string, unknown>,
    depth: number
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Filter dangerous keys for security
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }

      if (replacementsMade >= config.limit) {
        // Limit reached, copy remaining values as-is
        result[key] = value;
      } else {
        result[key] = replace(value, depth + 1);
      }
    }

    return result;
  }

  // Start recursion at depth 0
  const transformedData = replace(data, 0);

  return {
    data: transformedData,
    replacementsMade,
  };
}
