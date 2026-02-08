# Implementation Plan: Value Replacement Service

## Overview
Build an HTTP service that accepts JSON payloads and replaces exact string matches with a replacement value, following TDD practices and the specifications in ADR.md.

## Finalized Decisions
Based on ADR-001 and user input:
- **String Matching:** Exact match only (case-sensitive)
- **Limit Behavior:** Stop early when limit reached
- **Configuration:** Environment variables with optional `?limit=N` query parameter
- **Payload Limit:** 1MB
- **Default Replacement Limit:** 100 replacements
- **Max Nesting Depth:** 50 levels
- **Security:** Filter `__proto__`, `constructor`, `prototype` keys (prototype pollution protection)
- **Security Headers:** Use Helmet.js

## Technology Stack
- Node.js 18+ with TypeScript (strict mode)
- Express.js for HTTP layer
- Vitest for testing
- pnpm for package management

## Phase 1: Project Initialization

### Setup Commands
```bash
cd /Users/miguelog/Documents/code/catDogProj
pnpm init
pnpm add express helmet
pnpm add -D typescript @types/node @types/express @types/helmet
pnpm add -D tsx vitest @vitest/ui
pnpm add -D @types/supertest supertest
pnpm add -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### Configuration Files to Create

**package.json scripts:**
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts"
  }
}
```

**tsconfig.json:** Strict mode with ES2022 target, output to `dist/`

**.env.example:**
```
PORT=3000
TARGET_VALUE=dog
REPLACEMENT_VALUE=cat
DEFAULT_REPLACEMENT_LIMIT=100
MAX_NESTING_DEPTH=50
```

**.gitignore:** node_modules, dist, .env, coverage

## Phase 2: Core Domain Logic (TDD)

### File: `src/types.ts`
Define TypeScript interfaces first:
- `ReplacementConfig` - configuration for replacement operation
- `ReplacementResult` - result with data and count
- `TransformResponse` - HTTP response structure with data/meta wrapper

### File: `src/replacer.test.ts` (WRITE FIRST)
Test-driven development - write all tests before implementation:

**Critical test cases:**
1. Basic replacements (exact match, case-sensitive)
2. No partial replacements ("hotdog" stays "hotdog")
3. Nested structures (objects and arrays)
4. Limit enforcement (stop early when limit reached)
5. Edge cases (empty objects, null, undefined, top-level strings)
6. Non-string values (numbers, booleans, null) - no replacement
7. **Security: Prototype pollution** (filter `__proto__`, `constructor`, `prototype`)
8. **Depth limit** (throw error when max depth exceeded)

Target: 90% coverage for business logic

### File: `src/replacer.ts` (IMPLEMENT AFTER TESTS)
Core algorithm implementation:

**Key functions (10-20 lines each):**
- `replaceValues(data, config)` - main entry point
- `replace(value, depth)` - recursive replacement with depth tracking
- `replaceInArray(arr, depth)` - array-specific logic
- `replaceInObject(obj, depth)` - object-specific logic with key filtering
- `isPlainObject(value)` - type guard

**Algorithm characteristics:**
- Recursive traversal with early stopping (when limit reached)
- Immutable (returns new structures, doesn't mutate input)
- Depth tracking to prevent stack overflow
- Security: Skip dangerous keys (`__proto__`, `constructor`, `prototype`)

**Time complexity:** O(n) where n = values in JSON
**Space complexity:** O(d) where d = depth (recursion stack)

## Phase 3: Configuration Management (TDD)

### File: `src/config.test.ts` (WRITE FIRST)
Test cases:
- Load from environment variables
- Use defaults when env vars not set
- Validate port number (1-65535)
- Validate limit (>= 0)
- Validate target value (not empty)
- Validate max depth (>= 1)

### File: `src/config.ts` (IMPLEMENT AFTER TESTS)
Environment variable parsing with validation:

**Key functions:**
- `getConfig()` - main export, returns `AppConfig`
- `parsePort(value)` - validate and parse port (default: 3000)
- `parseTargetValue(value)` - validate target (default: "dog")
- `parseLimit(value)` - validate limit (default: 100)
- `parseMaxDepth(value)` - validate depth (default: 50)

**Error handling:** Throw on invalid config at startup (fail fast)

## Phase 4: HTTP API Layer (TDD)

### File: `src/server.test.ts` (WRITE FIRST)
Integration tests with supertest:

**Success cases:**
- Transform simple payload with default limit
- Custom limit via query parameter `?limit=N`
- Nested structures
- Top-level string payloads
- Empty objects/arrays

**Error cases:**
- Invalid JSON → 400
- Payload > 1MB → 413
- Negative limit → 400
- Non-numeric limit → 400
- Deep nesting (>50 levels) → 400

**Security:**
- Helmet.js headers present
- Prototype pollution protection works

**Health check:**
- GET /health returns 200 with status

### File: `src/server.ts` (IMPLEMENT AFTER TESTS)
Express application setup:

**Middleware stack:**
1. `helmet()` - security headers
2. `express.json({ limit: '1mb' })` - body parser with size limit

**Endpoints:**
- `GET /health` - health check
- `POST /transform` - main transformation endpoint

**Key functions:**
- `createApp(config)` - factory function, returns Express app
- `parseLimitParam(value, defaultLimit)` - parse and validate limit query param
- Error handler middleware - log server-side, generic client messages

**Response format:**
```json
{
  "data": <transformed payload>,
  "meta": {
    "replacementsMade": number,
    "replacementLimit": number
  }
}
```

### File: `src/index.ts`
Server entry point:
- Load config via `getConfig()`
- Create app via `createApp(config)`
- Start listening on configured port
- Log startup info (port, target/replacement, limits)
- Exit on startup errors

## Phase 5: Integration & Documentation

### File: `src/integration.test.ts`
End-to-end tests:
- Realistic complex payloads
- Limit enforcement in complex structures
- Prototype pollution attack scenarios

### File: `README.md`
Documentation including:
- Quick start guide
- API documentation with examples
- Configuration table
- Security features
- Testing instructions
- Architecture overview (reference ADR.md)

## Critical Files Summary

1. **src/types.ts** - TypeScript interfaces (contracts)
2. **src/replacer.ts** - Core replacement logic with security
3. **src/config.ts** - Environment configuration with validation
4. **src/server.ts** - Express app with middleware and routes
5. **src/index.ts** - Server entry point

## TDD Workflow (Per Component)

1. **Write failing test** in `*.test.ts`
2. **Run test** - verify it fails: `pnpm test`
3. **Implement** minimal code to pass
4. **Run test** - verify it passes: `pnpm test`
5. **Refactor** to 10-20 line functions
6. **Run test** - ensure still passes
7. **Repeat** for next test case

## Verification Steps

After implementation, run in sequence:

```bash
# 1. Type safety
pnpm typecheck

# 2. Linting
pnpm lint

# 3. All tests pass
pnpm test

# 4. Coverage check (target: 85-90%)
pnpm test:coverage

# 5. Build succeeds
pnpm build

# 6. Manual API test
pnpm dev
# In another terminal:
curl -X POST http://localhost:3000/transform \
  -H "Content-Type: application/json" \
  -d '{"pet": "dog", "nested": {"animal": "dog"}}'

# Expected response:
# {
#   "data": {"pet": "cat", "nested": {"animal": "cat"}},
#   "meta": {"replacementsMade": 2, "replacementLimit": 100}
# }

# 7. Health check
curl http://localhost:3000/health

# 8. Security audit
pnpm audit
```

## Security Verification Tests

Manually test these scenarios:

**Prototype pollution:**
```bash
curl -X POST http://localhost:3000/transform \
  -H "Content-Type: application/json" \
  -d '{"pet": "dog", "__proto__": {"isAdmin": true}}'
# Expected: __proto__ filtered out
```

**Limit enforcement:**
```bash
curl -X POST http://localhost:3000/transform?limit=2 \
  -H "Content-Type: application/json" \
  -d '{"a": "dog", "b": "dog", "c": "dog"}'
# Expected: replacementsMade = 2
```

## Edge Cases to Verify

- Empty object `{}` → unchanged, 0 replacements
- Null payload `null` → unchanged, 0 replacements
- Top-level string `"dog"` → `"cat"`, 1 replacement
- Numbers/booleans → unchanged (only strings replaced)
- Object keys with "dog" → keys unchanged (only values replaced)
- Deeply nested (>50 levels) → 400 error
- Large payload (>1MB) → 413 error

## Implementation Order

1. Initialize project (Phase 1)
2. Create `src/types.ts`
3. **TDD Cycle 1:** `src/replacer.test.ts` + `src/replacer.ts`
4. **TDD Cycle 2:** `src/config.test.ts` + `src/config.ts`
5. **TDD Cycle 3:** `src/server.test.ts` + `src/server.ts`
6. Create `src/index.ts`
7. Write integration tests
8. Write README.md
9. Run verification steps
10. Manual security testing

## Success Criteria

- ✅ All tests pass with 85-90% coverage
- ✅ TypeScript compiles with no errors (strict mode)
- ✅ Linter passes
- ✅ Build succeeds
- ✅ Manual API tests work
- ✅ Security tests pass (prototype pollution filtered)
- ✅ npm audit shows no critical vulnerabilities
- ✅ Functions are 10-20 lines max
- ✅ Documentation complete

## Estimated Timeline

- Phase 1 (Init): 30 min
- Phase 2 (Core logic TDD): 2 hours
- Phase 3 (Config TDD): 1 hour
- Phase 4 (HTTP layer TDD): 2 hours
- Phase 5 (Integration + Docs): 1.5 hours
- **Total: ~7 hours**
