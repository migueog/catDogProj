# Value Replacement Service

A TypeScript HTTP service that transforms JSON payloads by replacing string values with configurable limits and security safeguards.

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Start the development server
yarn dev
# Server starts on http://localhost:3000

# 3. Test with curl (in another terminal)
curl -X POST http://localhost:3000/transform \
  -H "Content-Type: application/json" \
  -d '{"pet": "dog", "nested": {"animal": "dog"}}'

# Expected response:
# {
#   "data": {"pet": "cat", "nested": {"animal": "cat"}},
#   "meta": {"replacementsMade": 2, "replacementLimit": 100}
# }
```

**Test key features:**

```bash
# Exact matching (no partial replacements)
curl -X POST http://localhost:3000/transform \
  -H "Content-Type: application/json" \
  -d '{"food": "hotdog", "pet": "dog"}'
# Result: "hotdog" stays unchanged, only "pet" → "cat"

# Case sensitivity
curl -X POST http://localhost:3000/transform \
  -H "Content-Type: application/json" \
  -d '{"a": "dog", "b": "Dog", "c": "DOG"}'
# Result: Only lowercase "dog" is replaced

# Replacement limit
curl -X POST http://localhost:3000/transform?limit=2 \
  -H "Content-Type: application/json" \
  -d '{"a":"dog","b":"dog","c":"dog","d":"dog"}'
# Result: {"data":{"a":"cat","b":"cat","c":"dog","d":"dog"},...}

# Health check
curl http://localhost:3000/health
# Result: {"status":"ok"}
```

**Verify quality:**

```bash
yarn test              # All tests pass
yarn test:coverage     # 85-90% coverage on business logic
yarn typecheck         # TypeScript strict mode - no errors
yarn lint              # Code quality checks pass
```

## Configuration

Configure via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP server port |
| `TARGET_VALUE` | dog | String to search for |
| `REPLACEMENT_VALUE` | cat | String to replace with |
| `DEFAULT_REPLACEMENT_LIMIT` | 100 | Max replacements per request |
| `MAX_NESTING_DEPTH` | 50 | Maximum JSON nesting depth |

## API Usage

### Transform Endpoint

Replace values in a JSON payload:

```bash
POST /transform?limit=10
Content-Type: application/json

{
  "pet": "dog",
  "nested": {
    "animal": "dog"
  }
}
```

**Response:**

```json
{
  "data": {
    "pet": "cat",
    "nested": {
      "animal": "cat"
    }
  },
  "meta": {
    "replacementsMade": 2,
    "replacementLimit": 10
  }
}
```

**Query Parameters:**
- `limit` (optional): Override default replacement limit for this request

### Health Check

```bash
GET /health

# Response: { "status": "ok" }
```

## Features

- **Exact string matching** (case-sensitive, no partial replacements)
- **Configurable limits** (stops early when limit reached)
- **Security hardening** (prototype pollution protection, Helmet.js)
- **Depth limiting** (prevents stack overflow)
- **Payload size limits** (1MB maximum)
- **Stateless design** (horizontally scalable)
- **Comprehensive test coverage** (90%+ on core logic)

## Matching Behavior

This service performs **exact string value matching** with the following rules:

### Rules

1. **Exact match only** - no partial matches within strings
2. **Case-sensitive** - exact case required for match
3. **Values only** - object keys are never modified
4. **Strings only** - numbers, booleans, and other types are never matched

### Examples

**Configuration:**
```json
{
  "targetValue": "dog",
  "replacementValue": "cat"
}
```

**Input:**
```json
{
  "pet": "dog",       // ✓ Exact match - will be replaced
  "breed": "Dog",     // ✗ Different case - unchanged
  "food": "hotdog",   // ✗ Not exact match (partial) - unchanged
  "animal": "DOG",    // ✗ Different case - unchanged
  "count": 42         // ✗ Not a string - unchanged
}
```

**Output:**
```json
{
  "pet": "cat",
  "breed": "Dog",
  "food": "hotdog",
  "animal": "DOG",
  "count": 42
}
```

### Why These Rules?

**Exact Match:** Prevents unintended replacements like `"hotdog"` → `"hotcat"`. Keeps behavior predictable and easy to reason about.

**Case-Sensitive:** JSON payloads typically contain structured data where case has semantic meaning:

```json
{
  "status": "Active",      // Enum value - case matters
  "environment": "PROD",   // Constant - case matters
  "role": "admin"          // Identifier - case matters
}
```

Replacing `"Active"` when searching for `"active"` would corrupt the data structure.

### Replacement Limit Behavior

When the replacement limit is reached mid-document:
- ✅ Document structure is fully preserved (all keys and elements present)
- ✅ Values are replaced up to the limit (first N matches)
- ✅ Remaining values are copied as-is (no transformation)
- ✅ Response includes metadata showing exact count
- ⚠️ Order matters: Traversal order determines which values get replaced

**Example:**

```bash
# Request with limit
POST /transform?limit=2
Content-Type: application/json

{"pets": ["dog", "dog", "dog", "dog"]}
```

```json
// Response: HTTP 200 OK
{
  "data": {
    "pets": ["cat", "cat", "dog", "dog"]
  },
  "meta": {
    "replacementsMade": 2,
    "replacementLimit": 2
  }
}
```

**Detecting when limit was hit:**

```javascript
const response = await fetch('/transform?limit=10', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

const { data, meta } = await response.json();

if (meta.replacementsMade === meta.replacementLimit) {
  console.warn('Replacement limit reached - some values unchanged');
  console.warn(`Consider increasing limit beyond ${meta.replacementLimit}`);
}
```

### Payload Constraints

- **Maximum payload size:** 1MB (returns `413 Payload Too Large` if exceeded)
- **Maximum nesting depth:** 50 levels (returns `400 Bad Request` if exceeded)

These limits protect against memory exhaustion and stack overflow attacks.

## Development

```bash
# Run tests in watch mode
yarn test:watch

# Check test coverage
yarn test:coverage

# Lint code
yarn lint

# Type check
yarn typecheck
```

## Testing

The project follows TDD with comprehensive test coverage:

- **Unit tests**: Core replacement logic (`src/replacer.test.ts`)
- **Configuration tests**: Environment variable validation (`src/config.test.ts`)
- **Integration tests**: HTTP API endpoints (`src/server.test.ts`)

```bash
# Run all tests
yarn test

# Run specific test file
yarn test src/replacer.test.ts

# Generate coverage report
yarn test:coverage
```

## Architecture

- **Pure functional core** (`replacer.ts`): Immutable transformations, no side effects
- **Configuration layer** (`config.ts`): Fail-fast validation at startup
- **HTTP layer** (`server.ts`): Express app with security middleware
- **Entry point** (`index.ts`): Server initialization

See `CLAUDE.md` for detailed development standards and `ADR.md` for architectural decisions.

## Security

- Prototype pollution protection (filters dangerous keys)
- Request size limits (1MB maximum)
- Depth limits (prevents stack overflow)
- Security headers via Helmet.js
- Generic error messages (no stack trace leakage)

## License

MIT
