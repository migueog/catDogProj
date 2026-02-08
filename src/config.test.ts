/**
 * Tests for configuration loading and validation
 * Following TDD: These tests are written BEFORE implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfig } from './config.js';

describe('getConfig', () => {
  // Store original env to restore after each test
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loading from environment', () => {
    it('should load all values from environment variables', () => {
      process.env.PORT = '8080';
      process.env.TARGET_VALUE = 'foo';
      process.env.REPLACEMENT_VALUE = 'bar';
      process.env.DEFAULT_REPLACEMENT_LIMIT = '50';
      process.env.MAX_NESTING_DEPTH = '100';

      const config = getConfig();

      expect(config.port).toBe(8080);
      expect(config.targetValue).toBe('foo');
      expect(config.replacementValue).toBe('bar');
      expect(config.defaultReplacementLimit).toBe(50);
      expect(config.maxNestingDepth).toBe(100);
    });
  });

  describe('default values', () => {
    it('should use default PORT when not set', () => {
      delete process.env.PORT;
      const config = getConfig();
      expect(config.port).toBe(3000);
    });

    it('should use default TARGET_VALUE when not set', () => {
      delete process.env.TARGET_VALUE;
      const config = getConfig();
      expect(config.targetValue).toBe('dog');
    });

    it('should use default REPLACEMENT_VALUE when not set', () => {
      delete process.env.REPLACEMENT_VALUE;
      const config = getConfig();
      expect(config.replacementValue).toBe('cat');
    });

    it('should use default DEFAULT_REPLACEMENT_LIMIT when not set', () => {
      delete process.env.DEFAULT_REPLACEMENT_LIMIT;
      const config = getConfig();
      expect(config.defaultReplacementLimit).toBe(100);
    });

    it('should use default MAX_NESTING_DEPTH when not set', () => {
      delete process.env.MAX_NESTING_DEPTH;
      const config = getConfig();
      expect(config.maxNestingDepth).toBe(50);
    });
  });

  describe('validation', () => {
    it('should reject port < 1', () => {
      process.env.PORT = '0';
      expect(() => getConfig()).toThrow(/port/i);
    });

    it('should reject port > 65535', () => {
      process.env.PORT = '65536';
      expect(() => getConfig()).toThrow(/port/i);
    });

    it('should reject negative replacement limit', () => {
      process.env.DEFAULT_REPLACEMENT_LIMIT = '-1';
      expect(() => getConfig()).toThrow(/limit/i);
    });

    it('should reject empty target value', () => {
      process.env.TARGET_VALUE = '';
      expect(() => getConfig()).toThrow(/target/i);
    });

    it('should reject max depth < 1', () => {
      process.env.MAX_NESTING_DEPTH = '0';
      expect(() => getConfig()).toThrow(/depth/i);
    });

    it('should reject invalid port (non-numeric)', () => {
      process.env.PORT = 'abc';
      expect(() => getConfig()).toThrow(/port/i);
    });

    it('should reject invalid limit (non-numeric)', () => {
      process.env.DEFAULT_REPLACEMENT_LIMIT = 'xyz';
      expect(() => getConfig()).toThrow(/limit/i);
    });
  });

  describe('edge cases', () => {
    it('should allow replacement limit of 0', () => {
      process.env.DEFAULT_REPLACEMENT_LIMIT = '0';
      const config = getConfig();
      expect(config.defaultReplacementLimit).toBe(0);
    });

    it('should allow same target and replacement values', () => {
      process.env.TARGET_VALUE = 'same';
      process.env.REPLACEMENT_VALUE = 'same';
      const config = getConfig();
      expect(config.targetValue).toBe('same');
      expect(config.replacementValue).toBe('same');
    });

    it('should trim whitespace from string values', () => {
      process.env.TARGET_VALUE = '  dog  ';
      process.env.REPLACEMENT_VALUE = '  cat  ';
      const config = getConfig();
      expect(config.targetValue).toBe('dog');
      expect(config.replacementValue).toBe('cat');
    });
  });
});
