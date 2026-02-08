/**
 * Tests for HTTP server and API endpoints
 * Following TDD: These tests are written BEFORE implementation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from './server.js';
import type { AppConfig } from './types.js';

describe('HTTP Server', () => {
  const testConfig: AppConfig = {
    port: 3000,
    targetValue: 'dog',
    replacementValue: 'cat',
    defaultReplacementLimit: 100,
    maxNestingDepth: 50,
  };

  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    app = createApp(testConfig);
  });

  describe('GET /health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });
  });

  describe('POST /transform', () => {
    describe('successful transformations', () => {
      it('should transform payload with default limit', async () => {
        const payload = { pet: 'dog', animal: 'dog' };

        const response = await request(app)
          .post('/transform')
          .send(payload)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
          data: { pet: 'cat', animal: 'cat' },
          meta: {
            replacementsMade: 2,
            replacementLimit: 100,
          },
        });
      });

      it('should transform with custom limit via query param', async () => {
        const payload = { a: 'dog', b: 'dog', c: 'dog' };

        const response = await request(app)
          .post('/transform?limit=2')
          .send(payload)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.meta.replacementsMade).toBe(2);
        expect(response.body.meta.replacementLimit).toBe(2);
      });

      it('should handle nested structures', async () => {
        const payload = {
          pets: ['dog', 'dog'],
          nested: { animal: 'dog' },
        };

        const response = await request(app)
          .post('/transform')
          .send(payload)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
          pets: ['cat', 'cat'],
          nested: { animal: 'cat' },
        });
        expect(response.body.meta.replacementsMade).toBe(3);
      });

      it('should handle empty payload', async () => {
        const response = await request(app)
          .post('/transform')
          .send({})
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({});
        expect(response.body.meta.replacementsMade).toBe(0);
      });
    });

    describe('error handling', () => {
      it('should reject invalid JSON with 400', async () => {
        const response = await request(app)
          .post('/transform')
          .send('{ invalid json }')
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });

      it('should reject negative limit with 400', async () => {
        const response = await request(app)
          .post('/transform?limit=-1')
          .send({ pet: 'dog' })
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toMatch(/limit/i);
      });

      it('should reject non-numeric limit with 400', async () => {
        const response = await request(app)
          .post('/transform?limit=abc')
          .send({ pet: 'dog' })
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
      });

      it('should reject excessively deep nesting with 400', async () => {
        // Create deeply nested structure beyond max depth
        let deep: any = { value: 'dog' };
        for (let i = 0; i < 60; i++) {
          deep = { nested: deep };
        }

        const response = await request(app)
          .post('/transform')
          .send(deep)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toMatch(/depth/i);
      });

      it('should reject payload larger than 1MB with 413', async () => {
        // Create a large payload > 1MB
        const largePayload = { data: 'x'.repeat(2 * 1024 * 1024) };

        const response = await request(app)
          .post('/transform')
          .send(largePayload)
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(413);
      });
    });

    describe('security headers (Helmet.js)', () => {
      it('should include X-Content-Type-Options header', async () => {
        const response = await request(app)
          .post('/transform')
          .send({ pet: 'dog' });

        expect(response.headers['x-content-type-options']).toBe('nosniff');
      });

      it('should include X-Frame-Options header', async () => {
        const response = await request(app)
          .post('/transform')
          .send({ pet: 'dog' });

        expect(response.headers['x-frame-options']).toBeDefined();
      });
    });
  });

  describe('error responses', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown');

      expect(response.status).toBe(404);
    });

    it('should not leak error details in production', async () => {
      // Trigger an error and ensure response is generic
      const response = await request(app)
        .post('/transform?limit=-1')
        .send({ pet: 'dog' });

      expect(response.body.error).toBeDefined();
      expect(response.body.error).not.toMatch(/stack/i);
      expect(response.body).not.toHaveProperty('stack');
    });
  });
});
