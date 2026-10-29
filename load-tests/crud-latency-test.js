import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

/**
 * CRUD Latency Test for All Tier Levels
 *
 * Tests all CRUD operations for each tenant tier:
 * - GET /products (list all)
 * - GET /products/{id} (get single)
 * - POST /products (create)
 * - PUT /products/{id} (update)
 * - DELETE /products/{id} (delete)
 *
 * Purpose: Measure p50, p95, p99 latency for each operation across tiers
 */

// API URL comes from an environment variable (see .env.example). No
// x-api-key header: the authorizer selects the tenant's usage plan.
const BASE_URL = __ENV.BASE_URL;

// JWT tokens from environment variables
const BASIC_JWT = __ENV.BASIC_TOKEN || "";
const STANDARD_JWT = __ENV.STANDARD_TOKEN || "";
const PREMIUM_JWT = __ENV.PREMIUM_TOKEN || "";
const PLATINUM_JWT = __ENV.PLATINUM_TOKEN || "";

// Tenants configuration
const TENANTS = {
  BASIC: {
    name: "BasicCorp",
    tenantId: "t-cc327c5c",
    tier: "BASIC",
    jwtToken: BASIC_JWT,
  },
  STANDARD: {
    name: "TestStandardCorp",
    tenantId: "t-9a72f0b8",
    tier: "STANDARD",
    jwtToken: STANDARD_JWT,
  },
  PREMIUM: {
    name: "PremiumCorp",
    tenantId: "t-46d6c4c8",
    tier: "PREMIUM",
    jwtToken: PREMIUM_JWT,
  },
  PLATINUM: {
    name: "qwerty Corp",
    tenantId: "t-cad5c200",
    tier: "PLATINUM",
    jwtToken: PLATINUM_JWT,
  },
};

// ==================== METRICS ====================
// BASIC tier metrics
const basicGetListLatency = new Trend("basic_get_list_latency", true);
const basicGetSingleLatency = new Trend("basic_get_single_latency", true);
const basicPostLatency = new Trend("basic_post_latency", true);
const basicPutLatency = new Trend("basic_put_latency", true);
const basicDeleteLatency = new Trend("basic_delete_latency", true);
const basicRequests = new Counter("basic_requests");
const basicErrors = new Rate("basic_errors");

// STANDARD tier metrics
const standardGetListLatency = new Trend("standard_get_list_latency", true);
const standardGetSingleLatency = new Trend("standard_get_single_latency", true);
const standardPostLatency = new Trend("standard_post_latency", true);
const standardPutLatency = new Trend("standard_put_latency", true);
const standardDeleteLatency = new Trend("standard_delete_latency", true);
const standardRequests = new Counter("standard_requests");
const standardErrors = new Rate("standard_errors");

// PREMIUM tier metrics
const premiumGetListLatency = new Trend("premium_get_list_latency", true);
const premiumGetSingleLatency = new Trend("premium_get_single_latency", true);
const premiumPostLatency = new Trend("premium_post_latency", true);
const premiumPutLatency = new Trend("premium_put_latency", true);
const premiumDeleteLatency = new Trend("premium_delete_latency", true);
const premiumRequests = new Counter("premium_requests");
const premiumErrors = new Rate("premium_errors");

// PLATINUM tier metrics
const platinumGetListLatency = new Trend("platinum_get_list_latency", true);
const platinumGetSingleLatency = new Trend("platinum_get_single_latency", true);
const platinumPostLatency = new Trend("platinum_post_latency", true);
const platinumPutLatency = new Trend("platinum_put_latency", true);
const platinumDeleteLatency = new Trend("platinum_delete_latency", true);
const platinumRequests = new Counter("platinum_requests");
const platinumErrors = new Rate("platinum_errors");

// ==================== TEST OPTIONS ====================
export const options = {
  // Include p(99) in summary output
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    // Warm-up phase: 1 VU per tier, 15s, staggered start
    warmup_basic: {
      executor: "constant-vus",
      vus: 1,
      duration: "15s",
      exec: "basicCrudScenario",
      tags: { tier: "BASIC", phase: "warmup" },
      startTime: "0s",
    },
    warmup_standard: {
      executor: "constant-vus",
      vus: 1,
      duration: "15s",
      exec: "standardCrudScenario",
      tags: { tier: "STANDARD", phase: "warmup" },
      startTime: "2s",
    },
    warmup_premium: {
      executor: "constant-vus",
      vus: 1,
      duration: "15s",
      exec: "premiumCrudScenario",
      tags: { tier: "PREMIUM", phase: "warmup" },
      startTime: "4s",
    },
    warmup_platinum: {
      executor: "constant-vus",
      vus: 1,
      duration: "15s",
      exec: "platinumCrudScenario",
      tags: { tier: "PLATINUM", phase: "warmup" },
      startTime: "6s",
    },
    // Main test phase: starts after warm-up, 1 VU per tier, 120s
    basic_crud: {
      executor: "constant-vus",
      vus: 1,
      duration: "120s",
      exec: "basicCrudScenario",
      tags: { tier: "BASIC" },
      startTime: "20s",
    },
    standard_crud: {
      executor: "constant-vus",
      vus: 1,
      duration: "120s",
      exec: "standardCrudScenario",
      tags: { tier: "STANDARD" },
      startTime: "22s",
    },
    premium_crud: {
      executor: "constant-vus",
      vus: 1,
      duration: "120s",
      exec: "premiumCrudScenario",
      tags: { tier: "PREMIUM" },
      startTime: "24s",
    },
    platinum_crud: {
      executor: "constant-vus",
      vus: 1,
      duration: "120s",
      exec: "platinumCrudScenario",
      tags: { tier: "PLATINUM" },
      startTime: "26s",
    },
  },
  thresholds: {
    // p95 should be under 3 seconds (allow cold starts)
    basic_get_list_latency: ["p(95)<3000"],
    standard_get_list_latency: ["p(95)<3000"],
    premium_get_list_latency: ["p(95)<3000"],
    platinum_get_list_latency: ["p(95)<3000"],
    // Error rate should be low
    basic_errors: ["rate<0.15"],
    standard_errors: ["rate<0.15"],
    premium_errors: ["rate<0.15"],
    platinum_errors: ["rate<0.15"],
  },
};

// ==================== HELPER FUNCTIONS ====================
function getHeaders(tenant) {
  return {
    Authorization: `Bearer ${tenant.jwtToken}`,
    "Content-Type": "application/json",
  };
}

function generateProduct() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return {
    sku: `SKU-${timestamp}-${random}`,
    name: `Test Product ${random}`,
    price: Math.floor(Math.random() * 1000) + 10,
    category: {
      id: "cat-1",
      name: "Test Category",
    },
  };
}

// ==================== CRUD OPERATIONS ====================
function runCrudCycle(
  tenant,
  metrics = {
    getListLatency: null,
    getSingleLatency: null,
    postLatency: null,
    putLatency: null,
    deleteLatency: null,
    requests: null,
    errors: null,
  },
) {
  const headers = getHeaders(tenant);
  let createdProductKey = null;

  // 1. GET /products (list)
  {
    const res = http.get(`${BASE_URL}/products`, {
      headers,
      tags: { operation: "GET_LIST", tier: tenant.tier },
    });
    metrics.getListLatency.add(res.timings.duration);
    metrics.requests.add(1);
    const success = check(res, {
      "GET list status is 200": (r) => r.status === 200,
    });
    metrics.errors.add(!success);
    if (!success) {
      console.log(
        `[${tenant.tier}] GET /products failed: status=${res.status}`,
      );
    }
  }

  sleep(1.5);

  // 2. POST /products (create)
  {
    const product = generateProduct();
    const res = http.post(`${BASE_URL}/product`, JSON.stringify(product), {
      headers,
      tags: { operation: "POST", tier: tenant.tier },
    });
    metrics.postLatency.add(res.timings.duration);
    metrics.requests.add(1);
    const success = check(res, {
      "POST status is 200 or 201": (r) => r.status === 200 || r.status === 201,
    });
    metrics.errors.add(!success);

    if (res.body) {
      try {
        const body = JSON.parse(res.body);
        if (!success) {
          console.log(
            `[${tenant.tier}] POST /product failed: status=${res.status} body=${JSON.stringify(body).substring(0, 200)}`,
          );
        }
        // Product model serializes with "key" field (shardId:productId)
        if (body.key) {
          createdProductKey = body.key;
        } else if (body.shardId && body.productId) {
          createdProductKey = `${body.shardId}:${body.productId}`;
        }
      } catch (e) {
        console.log(
          `[${tenant.tier}] POST parse error: ${e.message}, body=${String(res.body).substring(0, 200)}`,
        );
      }
    } else {
      console.log(
        `[${tenant.tier}] POST /product failed: status=${res.status} (no body)`,
      );
    }
  }

  sleep(1.5);

  // 3. GET /products/{id} (get single) - only if we have a key
  if (createdProductKey) {
    const res = http.get(`${BASE_URL}/product/${createdProductKey}`, {
      headers,
      tags: { operation: "GET_SINGLE", tier: tenant.tier },
    });
    metrics.getSingleLatency.add(res.timings.duration);
    metrics.requests.add(1);
    const success = check(res, {
      "GET single status is 200": (r) => r.status === 200,
    });
    metrics.errors.add(!success);
    if (!success) {
      console.log(
        `[${tenant.tier}] GET /product/${createdProductKey} failed: status=${res.status}`,
      );
    }

    sleep(1.5);

    // 4. PUT /products/{id} (update)
    {
      const updatedProduct = {
        name: `Updated Product ${Date.now()}`,
        price: Math.floor(Math.random() * 1000) + 100,
      };
      const res = http.put(
        `${BASE_URL}/product/${createdProductKey}`,
        JSON.stringify(updatedProduct),
        { headers, tags: { operation: "PUT", tier: tenant.tier } },
      );
      metrics.putLatency.add(res.timings.duration);
      metrics.requests.add(1);
      const success = check(res, {
        "PUT status is 200": (r) => r.status === 200,
      });
      metrics.errors.add(!success);
      if (!success) {
        console.log(`[${tenant.tier}] PUT failed: status=${res.status}`);
      }
    }

    sleep(1.5);

    // 5. DELETE /products/{id} (delete)
    {
      const res = http.del(`${BASE_URL}/product/${createdProductKey}`, null, {
        headers,
        tags: { operation: "DELETE", tier: tenant.tier },
      });
      metrics.deleteLatency.add(res.timings.duration);
      metrics.requests.add(1);
      const success = check(res, {
        "DELETE status is 200": (r) => r.status === 200,
      });
      metrics.errors.add(!success);
      if (!success) {
        console.log(`[${tenant.tier}] DELETE failed: status=${res.status}`);
      }
    }
  } else {
    // POST failed - skip GET_SINGLE/PUT/DELETE to avoid corrupting metrics
    console.log(
      `[${tenant.tier}] Skipping GET_SINGLE/PUT/DELETE (POST failed, no key)`,
    );
  }

  sleep(2);
}

// ==================== SCENARIO FUNCTIONS ====================
export function basicCrudScenario() {
  runCrudCycle(TENANTS.BASIC, {
    getListLatency: basicGetListLatency,
    getSingleLatency: basicGetSingleLatency,
    postLatency: basicPostLatency,
    putLatency: basicPutLatency,
    deleteLatency: basicDeleteLatency,
    requests: basicRequests,
    errors: basicErrors,
  });
}

export function standardCrudScenario() {
  runCrudCycle(TENANTS.STANDARD, {
    getListLatency: standardGetListLatency,
    getSingleLatency: standardGetSingleLatency,
    postLatency: standardPostLatency,
    putLatency: standardPutLatency,
    deleteLatency: standardDeleteLatency,
    requests: standardRequests,
    errors: standardErrors,
  });
}

export function premiumCrudScenario() {
  runCrudCycle(TENANTS.PREMIUM, {
    getListLatency: premiumGetListLatency,
    getSingleLatency: premiumGetSingleLatency,
    postLatency: premiumPostLatency,
    putLatency: premiumPutLatency,
    deleteLatency: premiumDeleteLatency,
    requests: premiumRequests,
    errors: premiumErrors,
  });
}

export function platinumCrudScenario() {
  runCrudCycle(TENANTS.PLATINUM, {
    getListLatency: platinumGetListLatency,
    getSingleLatency: platinumGetSingleLatency,
    postLatency: platinumPostLatency,
    putLatency: platinumPutLatency,
    deleteLatency: platinumDeleteLatency,
    requests: platinumRequests,
    errors: platinumErrors,
  });
}

// ==================== SUMMARY ====================
export function handleSummary(data) {
  const getMetricStats = (metricName) => {
    const metric = data.metrics[metricName];
    if (!metric || !metric.values) {
      return { p50: 0, p90: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
    }
    return {
      p50: metric.values.med || metric.values["p(50)"] || 0,
      p90: metric.values["p(90)"] || 0,
      p95: metric.values["p(95)"] || 0,
      p99: metric.values["p(99)"] || 0,
      avg: metric.values.avg || 0,
      min: metric.values.min || 0,
      max: metric.values.max || 0,
    };
  };

  const getCount = (metricName) => {
    const metric = data.metrics[metricName];
    if (!metric || !metric.values) return 0;
    return metric.values.count || 0;
  };

  const getRate = (metricName) => {
    const metric = data.metrics[metricName];
    if (!metric || !metric.values) return 0;
    return (metric.values.rate || 0) * 100;
  };

  // Collect all metrics
  const results = {
    BASIC: {
      GET_LIST: getMetricStats("basic_get_list_latency"),
      GET_SINGLE: getMetricStats("basic_get_single_latency"),
      POST: getMetricStats("basic_post_latency"),
      PUT: getMetricStats("basic_put_latency"),
      DELETE: getMetricStats("basic_delete_latency"),
      totalRequests: getCount("basic_requests"),
      errorRate: getRate("basic_errors"),
    },
    STANDARD: {
      GET_LIST: getMetricStats("standard_get_list_latency"),
      GET_SINGLE: getMetricStats("standard_get_single_latency"),
      POST: getMetricStats("standard_post_latency"),
      PUT: getMetricStats("standard_put_latency"),
      DELETE: getMetricStats("standard_delete_latency"),
      totalRequests: getCount("standard_requests"),
      errorRate: getRate("standard_errors"),
    },
    PREMIUM: {
      GET_LIST: getMetricStats("premium_get_list_latency"),
      GET_SINGLE: getMetricStats("premium_get_single_latency"),
      POST: getMetricStats("premium_post_latency"),
      PUT: getMetricStats("premium_put_latency"),
      DELETE: getMetricStats("premium_delete_latency"),
      totalRequests: getCount("premium_requests"),
      errorRate: getRate("premium_errors"),
    },
    PLATINUM: {
      GET_LIST: getMetricStats("platinum_get_list_latency"),
      GET_SINGLE: getMetricStats("platinum_get_single_latency"),
      POST: getMetricStats("platinum_post_latency"),
      PUT: getMetricStats("platinum_put_latency"),
      DELETE: getMetricStats("platinum_delete_latency"),
      totalRequests: getCount("platinum_requests"),
      errorRate: getRate("platinum_errors"),
    },
  };

  const formatMs = (ms) => ms.toFixed(0).padStart(6);

  const summary = `
╔════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                              CRUD LATENCY TEST RESULTS                                                 ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                        ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ BASIC TIER (Pooled)                                              Requests: ${String(results.BASIC.totalRequests).padStart(5)} | Errors: ${results.BASIC.errorRate.toFixed(2)}% │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ OPERATION      │    p50 (ms)  │    p95 (ms)  │    p99 (ms)  │    avg (ms)  │    max (ms)       │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ GET /products  │ ${formatMs(results.BASIC.GET_LIST.p50)}       │ ${formatMs(results.BASIC.GET_LIST.p95)}       │ ${formatMs(results.BASIC.GET_LIST.p99)}       │ ${formatMs(results.BASIC.GET_LIST.avg)}       │ ${formatMs(results.BASIC.GET_LIST.max)}            │  ║
║  │ GET /{id}      │ ${formatMs(results.BASIC.GET_SINGLE.p50)}       │ ${formatMs(results.BASIC.GET_SINGLE.p95)}       │ ${formatMs(results.BASIC.GET_SINGLE.p99)}       │ ${formatMs(results.BASIC.GET_SINGLE.avg)}       │ ${formatMs(results.BASIC.GET_SINGLE.max)}            │  ║
║  │ POST           │ ${formatMs(results.BASIC.POST.p50)}       │ ${formatMs(results.BASIC.POST.p95)}       │ ${formatMs(results.BASIC.POST.p99)}       │ ${formatMs(results.BASIC.POST.avg)}       │ ${formatMs(results.BASIC.POST.max)}            │  ║
║  │ PUT            │ ${formatMs(results.BASIC.PUT.p50)}       │ ${formatMs(results.BASIC.PUT.p95)}       │ ${formatMs(results.BASIC.PUT.p99)}       │ ${formatMs(results.BASIC.PUT.avg)}       │ ${formatMs(results.BASIC.PUT.max)}            │  ║
║  │ DELETE         │ ${formatMs(results.BASIC.DELETE.p50)}       │ ${formatMs(results.BASIC.DELETE.p95)}       │ ${formatMs(results.BASIC.DELETE.p99)}       │ ${formatMs(results.BASIC.DELETE.avg)}       │ ${formatMs(results.BASIC.DELETE.max)}            │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                        ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ STANDARD TIER (Pooled)                                           Requests: ${String(results.STANDARD.totalRequests).padStart(5)} | Errors: ${results.STANDARD.errorRate.toFixed(2)}% │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ OPERATION      │    p50 (ms)  │    p95 (ms)  │    p99 (ms)  │    avg (ms)  │    max (ms)       │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ GET /products  │ ${formatMs(results.STANDARD.GET_LIST.p50)}       │ ${formatMs(results.STANDARD.GET_LIST.p95)}       │ ${formatMs(results.STANDARD.GET_LIST.p99)}       │ ${formatMs(results.STANDARD.GET_LIST.avg)}       │ ${formatMs(results.STANDARD.GET_LIST.max)}            │  ║
║  │ GET /{id}      │ ${formatMs(results.STANDARD.GET_SINGLE.p50)}       │ ${formatMs(results.STANDARD.GET_SINGLE.p95)}       │ ${formatMs(results.STANDARD.GET_SINGLE.p99)}       │ ${formatMs(results.STANDARD.GET_SINGLE.avg)}       │ ${formatMs(results.STANDARD.GET_SINGLE.max)}            │  ║
║  │ POST           │ ${formatMs(results.STANDARD.POST.p50)}       │ ${formatMs(results.STANDARD.POST.p95)}       │ ${formatMs(results.STANDARD.POST.p99)}       │ ${formatMs(results.STANDARD.POST.avg)}       │ ${formatMs(results.STANDARD.POST.max)}            │  ║
║  │ PUT            │ ${formatMs(results.STANDARD.PUT.p50)}       │ ${formatMs(results.STANDARD.PUT.p95)}       │ ${formatMs(results.STANDARD.PUT.p99)}       │ ${formatMs(results.STANDARD.PUT.avg)}       │ ${formatMs(results.STANDARD.PUT.max)}            │  ║
║  │ DELETE         │ ${formatMs(results.STANDARD.DELETE.p50)}       │ ${formatMs(results.STANDARD.DELETE.p95)}       │ ${formatMs(results.STANDARD.DELETE.p99)}       │ ${formatMs(results.STANDARD.DELETE.avg)}       │ ${formatMs(results.STANDARD.DELETE.max)}            │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                        ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ PREMIUM TIER (Pooled, Per-tenant Usage Plan)                     Requests: ${String(results.PREMIUM.totalRequests).padStart(5)} | Errors: ${results.PREMIUM.errorRate.toFixed(2)}% │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ OPERATION      │    p50 (ms)  │    p95 (ms)  │    p99 (ms)  │    avg (ms)  │    max (ms)       │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ GET /products  │ ${formatMs(results.PREMIUM.GET_LIST.p50)}       │ ${formatMs(results.PREMIUM.GET_LIST.p95)}       │ ${formatMs(results.PREMIUM.GET_LIST.p99)}       │ ${formatMs(results.PREMIUM.GET_LIST.avg)}       │ ${formatMs(results.PREMIUM.GET_LIST.max)}            │  ║
║  │ GET /{id}      │ ${formatMs(results.PREMIUM.GET_SINGLE.p50)}       │ ${formatMs(results.PREMIUM.GET_SINGLE.p95)}       │ ${formatMs(results.PREMIUM.GET_SINGLE.p99)}       │ ${formatMs(results.PREMIUM.GET_SINGLE.avg)}       │ ${formatMs(results.PREMIUM.GET_SINGLE.max)}            │  ║
║  │ POST           │ ${formatMs(results.PREMIUM.POST.p50)}       │ ${formatMs(results.PREMIUM.POST.p95)}       │ ${formatMs(results.PREMIUM.POST.p99)}       │ ${formatMs(results.PREMIUM.POST.avg)}       │ ${formatMs(results.PREMIUM.POST.max)}            │  ║
║  │ PUT            │ ${formatMs(results.PREMIUM.PUT.p50)}       │ ${formatMs(results.PREMIUM.PUT.p95)}       │ ${formatMs(results.PREMIUM.PUT.p99)}       │ ${formatMs(results.PREMIUM.PUT.avg)}       │ ${formatMs(results.PREMIUM.PUT.max)}            │  ║
║  │ DELETE         │ ${formatMs(results.PREMIUM.DELETE.p50)}       │ ${formatMs(results.PREMIUM.DELETE.p95)}       │ ${formatMs(results.PREMIUM.DELETE.p99)}       │ ${formatMs(results.PREMIUM.DELETE.avg)}       │ ${formatMs(results.PREMIUM.DELETE.max)}            │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                        ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ PLATINUM TIER (Siloed - Dedicated Infrastructure)                Requests: ${String(results.PLATINUM.totalRequests).padStart(5)} | Errors: ${results.PLATINUM.errorRate.toFixed(2)}% │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ OPERATION      │    p50 (ms)  │    p95 (ms)  │    p99 (ms)  │    avg (ms)  │    max (ms)       │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ GET /products  │ ${formatMs(results.PLATINUM.GET_LIST.p50)}       │ ${formatMs(results.PLATINUM.GET_LIST.p95)}       │ ${formatMs(results.PLATINUM.GET_LIST.p99)}       │ ${formatMs(results.PLATINUM.GET_LIST.avg)}       │ ${formatMs(results.PLATINUM.GET_LIST.max)}            │  ║
║  │ GET /{id}      │ ${formatMs(results.PLATINUM.GET_SINGLE.p50)}       │ ${formatMs(results.PLATINUM.GET_SINGLE.p95)}       │ ${formatMs(results.PLATINUM.GET_SINGLE.p99)}       │ ${formatMs(results.PLATINUM.GET_SINGLE.avg)}       │ ${formatMs(results.PLATINUM.GET_SINGLE.max)}            │  ║
║  │ POST           │ ${formatMs(results.PLATINUM.POST.p50)}       │ ${formatMs(results.PLATINUM.POST.p95)}       │ ${formatMs(results.PLATINUM.POST.p99)}       │ ${formatMs(results.PLATINUM.POST.avg)}       │ ${formatMs(results.PLATINUM.POST.max)}            │  ║
║  │ PUT            │ ${formatMs(results.PLATINUM.PUT.p50)}       │ ${formatMs(results.PLATINUM.PUT.p95)}       │ ${formatMs(results.PLATINUM.PUT.p99)}       │ ${formatMs(results.PLATINUM.PUT.avg)}       │ ${formatMs(results.PLATINUM.PUT.max)}            │  ║
║  │ DELETE         │ ${formatMs(results.PLATINUM.DELETE.p50)}       │ ${formatMs(results.PLATINUM.DELETE.p95)}       │ ${formatMs(results.PLATINUM.DELETE.p99)}       │ ${formatMs(results.PLATINUM.DELETE.avg)}       │ ${formatMs(results.PLATINUM.DELETE.max)}            │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                        ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                         ANALYSIS                                                       ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                        ║
║  Infrastructure Model:                                                                                 ║
║  ┌────────────┬───────────────────────────────────────────────────────────────────────────────────┐   ║
║  │ BASIC      │ Pooled - Shared Lambda, Shared DynamoDB, Per-tier Usage Plan                     │   ║
║  │ STANDARD   │ Pooled - Shared Lambda, Shared DynamoDB, Per-tier Usage Plan                     │   ║
║  │ PREMIUM    │ Pooled - Shared Lambda, Shared DynamoDB, Per-tenant Usage Plan                   │   ║
║  │ PLATINUM   │ Siloed - Dedicated Lambda, Dedicated DynamoDB, Dedicated Usage Plan              │   ║
║  └────────────┴───────────────────────────────────────────────────────────────────────────────────┘   ║
║                                                                                                        ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════════╝
`;

  console.log(summary);

  // Export JSON for visualization
  return {
    stdout: summary,
    "crud-latency-results.json": JSON.stringify(results, null, 2),
  };
}
