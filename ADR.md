# ADR-001: Value Replacement Service Design

> **What is an ADR?**  
> An Architecture Decision Record captures a decision, the context behind it, and the consequences. It's a snapshot of your thinking at the time — not a living document you constantly update.

## Status

**DRAFT** — Pending review with Technical Manager

_Other statuses: PROPOSED → ACCEPTED → DEPRECATED → SUPERSEDED_

---

## Context

_What is the situation that requires a decision? What problem are we solving?_

We need to build an HTTP endpoint that:
- Accepts arbitrary JSON payloads
- Replaces occurrences of a target string value (e.g., `"dog"`) with a replacement value (e.g., `"cat"`)
- Limits the number of replacements (configurable)
- Can withstand heavy traffic

This is an MVP implementation to demonstrate technical approach and software design thinking.

---

## Domain Language

_Defining terms we'll use consistently across code, documentation, and conversations._

| Term | Definition |
|------|------------|
| **Payload** | The incoming JSON document to be processed |
| **Target Value** | The string we're searching for (initially: `"dog"`) |
| **Replacement Value** | The string we substitute in (initially: `"cat"`) |
| **Replacement** | A single instance of swapping target → replacement |
| **Replacement Limit** | Maximum replacements allowed per request |
| **Traversal** | The process of walking through nested JSON structures |

---

## Decisions

### Decision 1: String Matching Strategy

**Question:** Should we replace exact matches only, or partial matches within strings?

| Option | Example Input | Example Output |
|--------|---------------|----------------|
| Exact match only | `"hotdog"` | `"hotdog"` (unchanged) |
| Partial replacement | `"hotdog"` | `"hotcat"` |

**Decision:** **Exact match only** (case-sensitive)

**Rationale:**

1. **Simplicity & Predictability:**
   - O(1) equality check: `value === config.targetValue`
   - Clear behavior: `"hotdog"` stays `"hotdog"` (no surprises)
   - Easy to explain and test (3-4 test cases vs 20-30 for partial matching)

2. **Performance:**
   - String equality is constant time
   - No substring search (O(n) per value) or regex overhead
   - No ReDoS (Regular Expression Denial of Service) vulnerability risk

3. **Reduced Edge Cases:**
   - No ambiguity: Should `"hotdog"` become `"hotcat"`? (Likely no)
   - No word boundary questions: Is `"dog-friendly"` a match?
   - No multiple occurrence questions: `"dog dog"` → `"cat dog"` or `"cat cat"`?

4. **MVP-Appropriate Scope:**
   - Partial matching would add significant complexity
   - Focus on core value: configurable replacement with limits

5. **Extensibility:**
   - Can add `strategy: 'exact' | 'partial' | 'word-boundary'` parameter later
   - Current implementation doesn't prevent future enhancements
   - Exact match is the most conservative default

**Examples:**

| Input Value | Target: `"dog"` | Exact Match Result | Partial Match Result |
|-------------|-----------------|-------------------|----------------------|
| `"dog"` | ✓ Match | `"cat"` | `"cat"` |
| `"hotdog"` | ✗ No match | `"hotdog"` | `"hotcat"` |
| `"dog-friendly"` | ✗ No match | `"dog-friendly"` | `"cat-friendly"` |
| `"my dog is"` | ✗ No match | `"my dog is"` | `"my cat is"` |

**When to revisit:** If users frequently request partial matching, add as opt-in strategy parameter.

---

### Decision 2: Case Sensitivity

**Question:** Should matching be case-sensitive?

| Option | Matches `"dog"`? |
|--------|------------------|
| Case-sensitive | `"dog"` ✓, `"Dog"` ✗, `"DOG"` ✗ |
| Case-insensitive | `"dog"` ✓, `"Dog"` ✓, `"DOG"` ✓ |

**Decision:** **Case-sensitive matching only**

**Rationale:**

1. **Data Integrity - Case Has Semantic Meaning:**
   - JSON payloads typically contain structured data where case matters:
     - **Enums:** `"status": "Active"` vs `"status": "ACTIVE"` (different values)
     - **Constants:** `"environment": "PROD"` vs `"environment": "prod"` (different contexts)
     - **IDs:** `"userId": "abc123"` vs `"userId": "ABC123"` (different users)
     - **Database values:** `"role": "Admin"` vs `"role": "admin"` (different permissions)

2. **Simplicity & Performance:**
   - O(1) equality check: `value === config.targetValue`
   - No string allocation overhead (no `.toLowerCase()` calls)
   - Single code path, minimal test cases

3. **Predictability:**
   - `"dog"` matches only `"dog"`, not `"Dog"` or `"DOG"`
   - No surprising transformations
   - Clear documentation: "Exact match, case-sensitive"

4. **MVP Scope:**
   - Case-insensitive with case preservation would require:
     - Tracking original case for each character
     - Applying capitalization patterns (`Dog` → `Cat`, `DOG` → `CAT`)
     - Handling mixed case (`DoG` → `CaT`?)
     - Significant additional implementation complexity
     - 20-30 additional test cases

5. **Alternative Considered - Case-Insensitive with Preservation:**
   ```typescript
   // Would require complex logic like:
   function preserveCase(original: string, replacement: string): string {
     if (original === original.toUpperCase()) return replacement.toUpperCase();
     if (original === original.toLowerCase()) return replacement.toLowerCase();
     if (original[0] === original[0].toUpperCase()) {
       return replacement[0].toUpperCase() + replacement.slice(1);
     }
     return replacement;
   }
   ```
   - This adds significant complexity for uncertain value
   - Structured data transformation rarely needs case preservation

**Examples:**

| Input Value | Target: `"dog"` | Case-Sensitive Result | Case-Insensitive Result |
|-------------|-----------------|----------------------|------------------------|
| `"dog"` | ✓ Match | `"cat"` | `"cat"` |
| `"Dog"` | ✗ No match | `"Dog"` | `"Cat"` |
| `"DOG"` | ✗ No match | `"DOG"` | `"CAT"` |
| `"DoG"` | ✗ No match | `"DoG"` | `"CaT"` (complex!) |

**When to revisit:** If use cases shift toward text processing (not structured data), add case-insensitive mode as opt-in parameter.

---

### Decision 3: Behaviour When Hitting Replacement Limit

**Question:** What happens when the replacement limit is reached mid-document?

| Option | Behaviour | Trade-off |
|--------|-----------|-----------|
| **A: Stop Early** | Stop traversing once limit reached | Faster, but traversal order matters |
| **B: Continue & Skip** | Traverse entire document, skip replacements after limit | Predictable, slightly more CPU |
| **C: Reject Request** | Return error if limit would be exceeded | Strict, requires pre-scan |

**Decision:** **Option A - Partial Success (Stop Early)**

**Rationale:**

1. **Graceful Degradation:**
   - Replace up to limit, copy remaining values as-is
   - Preserve full document structure (all keys/elements present)
   - Return HTTP 200 with partial results + metadata
   - Better user experience: Partial success > total failure

2. **Single-Pass Efficiency:**
   - O(n) traversal - process each value once
   - Stop immediately when limit reached (no wasted work)
   - No pre-scan required (Option C would need two passes)
   - Memory efficient: Don't build intermediate match lists

3. **Industry Pattern - Similar to:**
   - **AWS S3 ListObjects:** Returns up to 1000 objects, provides continuation token if more
   - **Elasticsearch Bulk API:** Processes up to limit, returns partial results
   - **Stripe API:** Rate limits with partial success, clear error codes
   - **GraphQL:** Partial data + errors array pattern

4. **Observability:**
   - Metadata clearly shows what happened:
     ```json
     {
       "meta": {
         "replacementsMade": 100,
         "replacementLimit": 100
       }
     }
     ```
   - Client can detect limit hit: `replacementsMade === replacementLimit`
   - Can retry with higher limit if needed

5. **Scalability:**
   - Handles high throughput: 1000+ requests/second per instance
   - Stateless design: No coordination between requests
   - Fast processing: Exits early, doesn't scan entire payload

**Behavior Details:**

**Order Dependency:**
- Traversal order determines which values get replaced
- Order: Object keys (insertion order), then array elements (index order)
- Example:
  ```json
  // Input with limit=2
  {"a": "dog", "b": "dog", "c": "dog"}

  // Output: First 2 keys replaced
  {"a": "cat", "b": "cat", "c": "dog"}
  ```

**Detection Logic for Clients:**
```javascript
const { data, meta } = await response.json();

if (meta.replacementsMade === meta.replacementLimit) {
  console.warn('Limit reached - some values unchanged');
  console.warn(`Consider increasing limit beyond ${meta.replacementLimit}`);
}
```

**Why Not Option B (Continue & Skip)?**
- Wastes CPU traversing after limit reached
- Doubles processing time for large payloads
- Same end result, worse performance

**Why Not Option C (Reject Request)?**
- Requires pre-scan to count matches (O(2n) instead of O(n))
- User must guess exact match count upfront (poor UX)
- Total failure worse than partial success for most use cases

**Trade-off Accepted:**
- Order matters: Different traversal order = different results
- Documented behavior: "First N matches are replaced"
- Client can detect via metadata and retry with higher limit

**When to revisit:** If users need deterministic ordering across runs, add sorting or explicit traversal order config.

---

### Decision 4: Configuration Method

**Question:** How should replacement limit and target/replacement values be configured?

| Option | Description | Use Case |
|--------|-------------|----------|
| Environment variables | Set at server startup | Simple, good for containers |
| Request headers | Per-request configuration | Flexible, client-controlled |
| Request body | Include config alongside payload | Self-contained requests |
| Query parameters | e.g., `?limit=10` | RESTful, visible in logs |

**Recommendation:** Environment variables for defaults, with optional query parameter override for limit.

**Decision:** **Accept recommendation** - Environment variables for target/replacement values, query parameter for per-request limit

**Rationale:**
- **Environment variables for target/replacement:**
  - Simple configuration for container deployments
  - Values rarely change (deployment-level config)
  - Secure: No sensitive data in URLs or logs

- **Query parameter for limit:**
  - Flexible: Override default per-request
  - RESTful: `?limit=50` is self-documenting
  - Visible in logs for debugging
  - No request body pollution

**Implementation:**
```typescript
// Defaults from environment
const config = {
  targetValue: process.env.TARGET_VALUE || 'dog',
  replacementValue: process.env.REPLACEMENT_VALUE || 'cat',
  limit: parseInt(process.env.DEFAULT_REPLACEMENT_LIMIT || '100', 10)
};

// Override limit per request
const limit = req.query.limit ? parseInt(req.query.limit, 10) : config.limit;
```

---

### Decision 5: Payload Size and Depth Limits

**Question:** What constraints should we enforce on payload size and nesting depth?

**Decisions:**
- **Payload Size Limit:** 1MB maximum
- **Max Nesting Depth:** 50 levels

**Rationale:**

1. **Payload Size (1MB):**
   - **Prevents memory exhaustion** from malicious/accidental large payloads
   - **10x Express default (100KB)** - generous but safe
   - **Typical JSON API payloads** are <100KB:
     - Small: 1-10KB (single resource)
     - Medium: 10-100KB (list of resources)
     - Large: 100KB-1MB (bulk operations)
   - **1MB allows headroom** for legitimate use cases
   - **Larger payloads suggest wrong tool** - should use batch processing/streaming

2. **Max Nesting Depth (50 levels):**
   - **Prevents stack overflow** from deeply nested recursion
   - **Real-world JSON** rarely exceeds 10-15 levels:
     - Typical: 3-5 levels (nested objects)
     - Complex: 10-15 levels (deeply nested configs)
     - Extreme: 20+ levels (unusual, likely generated)
   - **50 levels provides substantial safety margin** (3-5x typical depth)
   - **Configurable** via environment variable for special cases

**Error Handling:**
- **Payload >1MB:** HTTP 413 "Payload Too Large"
- **Depth >50:** HTTP 400 "Maximum nesting depth exceeded"
- Clear error messages guide users to fix issues

**Performance Impact:**
- **Size limit:** Enforced by Express middleware (no custom code needed)
- **Depth limit:** Checked during traversal (negligible overhead - single integer comparison)

**Examples:**

```json
// Depth calculation
{
  "level1": {           // depth 1
    "level2": {         // depth 2
      "level3": {       // depth 3
        "value": "dog"  // depth 4
      }
    }
  }
}
```

**When to revisit:** If legitimate use cases require >1MB payloads, consider streaming JSON parser.

---

### Decision 6: Traffic Scalability Architecture

**Question:** How do we "withstand heavy traffic"? What about sustained load vs burst traffic?

**Decision:** **Stateless horizontal scaling** (supports both traffic patterns)

**Architecture Principles:**

1. **Stateless Design:**
   - No session state, database, or shared memory
   - Each request is completely independent
   - No coordination between instances required

2. **Horizontal Scalability:**
   - Add instances as needed behind load balancer
   - Linear scalability: 2x instances = 2x throughput
   - No distributed locks, caches, or state synchronization

3. **Traffic Pattern Support:**

   **Sustained Load (e.g., 10K requests/second continuously):**
   - Run N instances permanently (e.g., 10 instances × 1K req/sec each)
   - Predictable resource usage
   - Simple capacity planning: "Need X instances for Y throughput"

   **Burst Traffic (e.g., 100 req/sec → 10K → 100):**
   - Auto-scale instances up/down with load
   - Pay only for resources used
   - Fast scale-up: Containers/serverless start in seconds
   - Kubernetes HPA, AWS Auto Scaling, etc.

**Performance Characteristics:**

| Metric | Estimate | Notes |
|--------|----------|-------|
| **Single instance throughput** | ~1000 requests/second | 10KB avg payload |
| **Processing time per request** | 1-5ms | Depends on payload size, nesting |
| **Memory per instance** | 50-100MB baseline | Excluding payload buffers |
| **Bottleneck** | CPU-bound | JSON parsing + traversal |

**Deployment Options:**

| Platform | Scaling Approach | Use Case |
|----------|------------------|----------|
| **Docker + Kubernetes** | Auto-scaling (HPA) | Enterprise, full control |
| **AWS Lambda** | Auto-scales, pay-per-request | Burst traffic, low operational overhead |
| **Cloud Run / App Engine** | Auto-scales with traffic | Hybrid sustained + burst |
| **Traditional VMs** | Manual scaling | Simple deployments, predictable load |

**Why This Architecture Works:**

✅ **No coordination overhead** - Instances don't talk to each other
✅ **No state synchronization** - No Redis, no distributed cache
✅ **Linear scalability** - Doubling instances doubles throughput
✅ **Failure isolation** - One instance crash doesn't affect others
✅ **Fast recovery** - Load balancer routes around failed instances

**Example Load Balancer Setup:**

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    │  (nginx/ALB)    │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Instance │   │ Instance │   │ Instance │
        │  1:3000  │   │  2:3000  │   │  3:3000  │
        └──────────┘   └──────────┘   └──────────┘

        Each instance:
        - Stateless (no session)
        - Identical code
        - Same environment config
        - Independent failure domain
```

**Future Enhancements (Beyond MVP):**

- **Rate limiting** - Protect against abuse (per-IP or global)
- **Request queuing** - Spike protection with queue depth limits
- **Caching** - If payloads repeat frequently (CDN or in-memory)
- **Async processing** - For very large payloads (job queue + workers)

**When to revisit:** If single-instance throughput becomes bottleneck, profile and optimize hot paths (likely JSON parsing).

---

## API Contract

### Request

```
POST /transform
Content-Type: application/json

{
  "pet": "dog",
  "nested": {
    "animal": "dog"
  }
}
```

Optional query parameter: `?limit=10` (overrides default)

### Success Response

```
HTTP/1.1 200 OK
Content-Type: application/json

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

> **Design Note:** Wrapping the response in `data` + `meta` allows us to return useful information about the operation without modifying the payload structure. This is optional — discuss if the response should just be the raw transformed payload.

### Error Responses

| Status | Scenario |
|--------|----------|
| `400 Bad Request` | Invalid JSON payload |
| `413 Payload Too Large` | Payload exceeds size limit |
| `422 Unprocessable Entity` | Valid JSON but cannot process (if using Option C above) |
| `500 Internal Server Error` | Unexpected server error |

---

## Performance & Traffic Considerations

_How do we "withstand heavy traffic"?_

### Payload Size Limit

- **Decision:** Limit request body to `[PLACEHOLDER: e.g., 1MB]`
- **Rationale:** Prevents memory exhaustion from malicious/accidental large payloads

### Default Replacement Limit

- **Decision:** Default to `[PLACEHOLDER: e.g., 100 or 1000]` replacements
- **Rationale:** Provides sensible guardrail while allowing override

### Rate Limiting

- **For MVP:** Not implemented (note: would be needed for production)
- **Future consideration:** Could add rate limiting middleware (e.g., express-rate-limit)

### Stateless Design

- Each request is independent — no session, no database
- Allows horizontal scaling (multiple instances behind load balancer)

---

## Technical Implementation Notes

### Technology Choices

- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js (most widely understood, simple setup)
- **Validation:** Manual TypeScript checks (no extra library for MVP)

### Project Structure

Keeping it minimal for the MVP — three files:

```
src/
├── index.ts          # Server setup + HTTP route
├── replacer.ts       # Core replacement logic (pure function)
└── config.ts         # Environment variable handling
```

> **Why separate `replacer.ts` from `index.ts`?**  
> The replacement logic is a pure function with no HTTP concerns. This makes it easy to test and reason about. As the project grows, we can introduce folders — but not before we need them.

---

## Security Considerations

_Identified through research of common Node.js API vulnerabilities._

### Prototype Pollution (CRITICAL)

**What it is:** A JavaScript-specific vulnerability where attackers inject properties like `__proto__` or `constructor` into JSON payloads to modify the prototype chain of all objects.

**Why it matters for us:** We're recursively traversing arbitrary JSON and potentially copying/modifying objects — this is exactly the pattern that's vulnerable.

**Example attack payload:**
```json
{
  "__proto__": {
    "isAdmin": true
  },
  "pet": "dog"
}
```

If we naively copy this object, all objects in our application could suddenly have `isAdmin: true`.

**Mitigations:**

| Approach | How | Trade-off |
|----------|-----|-----------|
| Filter dangerous keys | Skip `__proto__`, `constructor`, `prototype` during traversal | Simple, recommended for MVP |
| Use `Object.create(null)` | Create objects without prototype chain | More secure, slightly more complex |
| Schema validation | Reject payloads with dangerous keys upfront | Strictest, requires validation library |

**Decision:** `[PLACEHOLDER — recommend filtering dangerous keys for MVP]`

---

### Request Size Limits

**What it is:** Express's default body size limit is 100KB. Larger payloads consume memory and CPU.

**Recommendation from Express maintainers:** Payloads above 5MB can introduce memory and performance risks.

**Our approach:**
```typescript
app.use(express.json({ limit: '1mb' }));  // Explicit limit
```

**Decision:** Default to 1MB limit (10x Express default, still safe)

---

### Security Headers (Helmet.js)

Standard security headers protect against common web vulnerabilities.

```typescript
import helmet from 'helmet';
app.use(helmet());
```

This adds headers like:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HTTPS enforcement)

**For MVP:** Optional but recommended. Low effort, good protection.

---

### Error Handling — Don't Leak Information

**Bad:** Exposing stack traces to clients
```json
{
  "error": "TypeError: Cannot read property 'x' of undefined",
  "stack": "at replacer (/app/src/replacer.ts:42:15)..."
}
```

**Good:** Generic error message, log details server-side
```json
{
  "error": "An error occurred processing your request"
}
```

---

### Dependency Vulnerabilities

**Tool:** `npm audit` — scans dependencies for known vulnerabilities

**Integrate into workflow:**
```bash
npm audit          # Check for issues
npm audit fix      # Auto-fix where possible
```

**For MVP:** Run `npm audit` before deployment. Document any accepted risks.

---

### ReDoS (Regular Expression Denial of Service)

**What it is:** Specially crafted input can cause certain regex patterns to take exponential time, blocking the event loop.

**Relevance:** Only applies if we implement partial string matching with regex.

**Mitigation:** If using regex, test patterns with tools like [safe-regex](https://www.npmjs.com/package/safe-regex) or avoid user-controlled regex patterns entirely.

**For MVP (exact match only):** Not a concern — we're using simple string equality.

---

## Edge Cases

_Documenting how we handle unusual or boundary inputs. This prevents bugs and gives clear answers when stakeholders ask "what happens if...?"_

### Input Edge Cases

| Scenario | Example | Behaviour | Rationale |
|----------|---------|-----------|-----------|
| Empty object | `{}` | Return `{}`, 0 replacements | Valid input, nothing to replace |
| Empty array | `[]` | Return `[]`, 0 replacements | Valid input, nothing to replace |
| Null payload | `null` | Return `null`, 0 replacements | Valid JSON, pass through |
| Top-level string | `"dog"` | Return `"cat"`, 1 replacement | Valid JSON, should still work |
| Top-level non-matching string | `"hello"` | Return `"hello"`, 0 replacements | Valid JSON, no match |
| Deeply nested structure | 100+ levels deep | `[DECISION NEEDED]` | Risk of stack overflow — see Depth Limit below |
| Very large array | 100,000+ elements | Process up to limit, then skip | Payload size limit is primary protection |
| Invalid JSON | `{not: valid}` | `400 Bad Request` | Fail fast with clear error |

### Value Type Edge Cases

| Scenario | Example | Behaviour | Rationale |
|----------|---------|-----------|-----------|
| Target value in key | `{"dog": "cat"}` | Key unchanged, only values replaced | Spec says "replace values" |
| Number resembling target | N/A | No replacement | We only match strings |
| Boolean | `true` / `false` | No replacement | We only match strings |
| Null value | `{"pet": null}` | No replacement | `null` is not a string |
| Empty string | `{"pet": ""}` | No replacement | Empty string ≠ target |
| Unicode strings | `{"pet": "🐕"}` | No replacement (unless target is 🐕) | Exact match still applies |
| String with whitespace | `" dog "` | No replacement (exact match) | `" dog "` ≠ `"dog"` |

### Configuration Edge Cases

| Scenario | Behaviour | Rationale |
|----------|-----------|-----------|
| Limit set to 0 | Return original payload unchanged, 0 replacements | Valid — user wants no replacements |
| Limit set to negative number | Treat as 0 (or reject?) `[DECISION NEEDED]` | Defensive handling |
| Target equals replacement | Process normally, count as replacements | Technically valid, even if pointless |
| Empty target string | `400 Bad Request` (or ignore?) `[DECISION NEEDED]` | Empty string would match nothing meaningful |

### Depth Limit

**Problem:** Extremely deep nesting could cause stack overflow during recursive traversal.

```json
{"a":{"a":{"a":{"a":{"a":{"a": ... 1000 levels ... "dog"}}}}}}
```

**Options:**

| Option | Behaviour | Trade-off |
|--------|-----------|-----------|
| No limit | Process any depth | Risk of crash |
| Hard limit (e.g., 50 levels) | Return `400` if exceeded | Safe, but might reject valid payloads |
| Iterative traversal | Use stack-based iteration instead of recursion | More complex code, but no limit needed |

**Decision:** `[PLACEHOLDER — recommend starting with recursive + depth limit of 50, revisit if needed]`

---

## Scaling Considerations

_Answering "how does this handle heavy traffic?" with specifics._

### Stateless Design ✓

Each request is completely independent:
- No session state
- No database
- No in-memory cache between requests

**Why this matters:** You can run multiple instances behind a load balancer with zero coordination. Scaling horizontally is just "add more containers."

```
                    ┌─────────────────┐
                    │  Load Balancer  │
                    └────────┬────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Instance │   │ Instance │   │ Instance │
        │    1     │   │    2     │   │    3     │
        └──────────┘   └──────────┘   └──────────┘
```

### Resource Bottlenecks

| Resource | Concern | Mitigation |
|----------|---------|------------|
| **Memory** | Large payloads held in memory during processing | Payload size limit (e.g., 1MB) |
| **CPU** | Deep recursion / large arrays | Replacement limit, depth limit |
| **Event Loop** | Synchronous processing blocks other requests | See "Blocking" below |

### Blocking Behaviour

The replacement logic is **synchronous** — it runs on the main thread and blocks other requests while processing.

**For MVP:** This is acceptable. Express handles requests sequentially per-instance, and we have limits in place.

**For Production at scale:** Consider:
- Breaking very large payloads into chunks with `setImmediate()` to yield to the event loop
- Worker threads for CPU-intensive transformations
- This is premature optimization for now — note it as a future consideration

### Request Throughput Estimation

_Rough back-of-envelope calculation:_

Assuming:
- Average payload: 10KB
- Average replacements: 10
- Processing time: ~1ms per request (estimate)

A single Node.js instance could theoretically handle:
- **~1,000 requests/second** under ideal conditions

In practice, expect less due to network I/O, JSON parsing, garbage collection.

**Key insight:** This service is likely **I/O bound** (waiting for network) not **CPU bound** (processing). Node.js is well-suited for this.

### Rate Limiting (Future)

Not implemented for MVP, but document the approach:

```typescript
// Future: Add express-rate-limit
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
});

app.use('/transform', limiter);
```

### Monitoring (Future)

For production, we'd want to track:

| Metric | Why |
|--------|-----|
| Request count | Traffic volume |
| Response time (p50, p95, p99) | Performance |
| Error rate | Reliability |
| Payload size distribution | Capacity planning |
| Replacements per request | Usage patterns |

**For MVP:** Use `console.log` with timestamps. Structured logging (e.g., pino) can come later.

---

## Consequences

_What are the implications of these decisions?_

### Positive
- Simple, focused service with clear boundaries
- Stateless design enables easy scaling
- Pure domain logic is highly testable

### Negative / Trade-offs
- No persistence of transformation history (by design)
- Fixed target/replacement values require redeployment to change (unless we add request-level config)

### Risks
- Deep nesting or circular references in JSON could cause stack overflow (mitigation: add max depth limit)
- Large arrays could be slow to process (mitigation: payload size limit)

---

## Open Questions

_Items still to be resolved:_

### Core Behaviour
- [ ] Exact match vs. partial string replacement?
- [ ] Case-sensitive matching?
- [ ] Behaviour when limit is reached?
- [ ] Should target/replacement values be configurable per-request?

### Configuration
- [ ] What's an appropriate payload size limit? (Recommend: 1MB)
- [ ] What's a sensible default replacement limit? (Recommend: 100)
- [ ] What's the maximum nesting depth? (Recommend: 50)

### API Design
- [ ] Should the response include metadata, or just the transformed payload?
- [ ] How to handle negative limit values? (Reject or treat as 0?)
- [ ] How to handle empty target string? (Reject or ignore?)

### Security
- [ ] Prototype pollution mitigation approach? (Recommend: filter dangerous keys)
- [ ] Add Helmet.js for security headers? (Recommend: yes)
- [ ] Error response detail level? (Recommend: generic messages, log details server-side)

### Future Considerations (Not MVP)
- [ ] Rate limiting strategy?
- [ ] Monitoring/observability approach?
- [ ] Should we support streaming for very large payloads?

---

## References

- [ADR GitHub Organization](https://adr.github.io/) — Standard ADR templates and guidance
- [12-Factor App](https://12factor.net/) — Principles for building cloud-native services

---

## Future Enhancements (Beyond MVP Scope)

These features were considered but intentionally deferred to focus on core functionality. They serve as conversation starters for production readiness and architectural evolution.

### Flexible Matching Strategies

**Current:** Exact match only (case-sensitive)

**Future Options:**
- Add `strategy: 'exact' | 'partial' | 'word-boundary' | 'regex'` parameter
- Implement case-insensitive matching with opt-in flag
- Support regex patterns (with ReDoS protection via timeout/complexity limits)
- Word boundary matching: `"dog"` matches in `"my dog is"` but not `"hotdog"`

**Consideration:** Adds complexity - implement only if users request frequently.

---

### Advanced Limit Handling

**Current:** Partial success (stop early, return HTTP 200 with metadata)

**Future Options:**
- **Strict mode:** `strict: true` to reject entire request if limit exceeded (HTTP 422)
- **Pre-flight endpoint:** `POST /transform/count` to count matches without transforming
- **Enhanced metadata:** Add `matchesFound` field (total matches in document)
- **Resume tokens:** For very large documents, support continuation across requests

**Consideration:** Most use cases satisfied by current partial success behavior.

---

### Observability & Operations

**Current:** Basic console.log with timestamps

**Future Options:**
- **Structured logging:**
  - JSON format for machine parsing
  - Correlation IDs across requests
  - Log levels (ERROR, WARN, INFO, DEBUG)
  - Integration with logging services (Datadog, CloudWatch)

- **Metrics & Monitoring:**
  - Prometheus metrics endpoint (`/metrics`)
  - Request count, latency (p50, p95, p99)
  - Replacement count distribution
  - Error rates by type

- **Health checks:**
  - Deep health check (validate config, test core logic)
  - Liveness vs readiness probes (Kubernetes)
  - Dependency status (if added later)

- **Graceful shutdown:**
  - Handle SIGTERM for zero-downtime deploys
  - Drain in-flight requests before exit
  - Connection draining with timeout

**Consideration:** Critical for production - implement before first real deployment.

---

### Performance Optimizations

**Current:** Synchronous processing, single-pass traversal

**Future Options:**
- **Streaming JSON parser:**
  - For very large payloads (>1MB)
  - Process incrementally without full parse
  - Libraries: `stream-json`, `clarinet`

- **Worker threads:**
  - Offload CPU-intensive transformations
  - Prevents blocking event loop
  - Node.js `worker_threads` module

- **Response caching:**
  - If payloads repeat frequently
  - Cache key: hash(payload + config)
  - TTL-based eviction
  - Redis or in-memory (lru-cache)

- **Async iteration:**
  - Use `setImmediate()` to yield to event loop
  - Prevents single large payload from blocking other requests
  - Trade-off: Slower processing, better concurrency

**Consideration:** Profile first - optimize hot paths only if bottleneck identified.

---

### API Enhancements

**Current:** Single endpoint, environment config, query param override

**Future Options:**
- **Batch endpoint:**
  - `POST /transform/batch` - transform multiple payloads in one request
  - Returns array of results
  - Atomic or individual success handling

- **OpenAPI/Swagger specification:**
  - Interactive API documentation
  - Client code generation (TypeScript, Python, etc.)
  - Contract testing with spec validation

- **Request/response validation:**
  - JSON Schema validation for payloads
  - Reject malformed requests early
  - Clear error messages for validation failures

- **API versioning:**
  - URL-based: `/v1/transform`, `/v2/transform`
  - Header-based: `Accept-Version: v1`
  - Backward compatibility strategy

- **Per-request configuration:**
  - Include target/replacement in request body
  - Override any config without redeployment
  - Security consideration: Validate inputs carefully

**Consideration:** Add versioning before breaking changes; other features as needed.

---

### Security Enhancements

**Current:** Prototype pollution filtering, Helmet.js headers, size/depth limits

**Future Options:**
- **Rate limiting:**
  - Per-IP: Prevent single client abuse
  - Global: Protect service from overload
  - Libraries: `express-rate-limit`, `express-slow-down`

- **Request signing/authentication:**
  - API keys in headers
  - JWT tokens for user identification
  - OAuth 2.0 for enterprise integrations

- **Audit logging:**
  - Log all transformations for compliance
  - Track who/what/when for sensitive data
  - Tamper-proof log storage

- **Additional input validation:**
  - JSON Schema validation
  - Content-Type enforcement
  - Charset validation (UTF-8 only)

- **Security scanning:**
  - Regular `npm audit` in CI/CD
  - SAST (Static Application Security Testing)
  - Dependency vulnerability alerts

**Consideration:** Rate limiting should be added before exposing to public internet.

---

### Infrastructure & DevOps

**Current:** Manual deployment, no CI/CD

**Future Options:**
- **CI/CD pipeline:**
  - GitHub Actions, GitLab CI, Jenkins
  - Automated testing on PR
  - Deploy on merge to main

- **Containerization:**
  - Dockerfile for consistent builds
  - Multi-stage builds (build + runtime stages)
  - Image scanning for vulnerabilities

- **Kubernetes deployment:**
  - Deployment, Service, Ingress resources
  - Horizontal Pod Autoscaler (HPA)
  - Resource limits/requests

- **Infrastructure as Code:**
  - Terraform for cloud resources
  - Helm charts for Kubernetes
  - Environment-specific configs

- **Load testing:**
  - k6, Artillery, or JMeter
  - Realistic traffic patterns
  - Identify bottlenecks and capacity limits

- **Disaster recovery:**
  - Multi-region deployment
  - Automated failover
  - Backup and restore procedures

**Consideration:** Start with Docker + basic CI/CD; add orchestration as scale demands.

---

_Document created: [DATE]_
_Author: [Your Name]_
_Last updated: [DATE]_