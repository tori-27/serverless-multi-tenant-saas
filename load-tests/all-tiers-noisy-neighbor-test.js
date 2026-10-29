import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

/**
 * Complete Noisy Neighbor Test for All Tier Combinations
 *
 * Tests three scenarios:
 * 1. BASIC → STANDARD: Same tier-based rate limiting (shared pool)
 * 2. BASIC → PLATINUM: Cross-tier isolation (PLATINUM dedicated)
 * 3. PREMIUM → PREMIUM: Per-tenant isolation (individual usage plans)
 *
 * Expected Results:
 * - Scenario 1: Both BASIC and STANDARD affected (shared tier limits)
 * - Scenario 2: PLATINUM isolated (dedicated usage plan)
 * - Scenario 3: Each PREMIUM tenant isolated (per-tenant usage plans)
 */

// API URL and API keys come from environment variables (see .env.example)
const BASE_URL = __ENV.BASE_URL;

// JWT tokens from environment variables
const BASIC_JWT = __ENV.BASIC_TOKEN || "";
const STANDARD_JWT = __ENV.STANDARD_TOKEN || "";
const PLATINUM_JWT = __ENV.PLATINUM_TOKEN || "";
const PREMIUM_NOISY_JWT = __ENV.PREMIUM_NOISY_TOKEN || "";
const PREMIUM_VICTIM_JWT = __ENV.PREMIUM_VICTIM_TOKEN || "";

// Tenants configuration - LOWERED LIMITS FOR TESTING
const TENANTS = {
  // BASIC tier - shared API key with other BASIC tenants
  BASIC_NOISY: {
    name: "BasicCorp",
    tenantId: "t-cc327c5c",
    tier: "BASIC",
    apiKey: __ENV.BASIC_API_KEY,
    jwtToken: BASIC_JWT,
    rateLimit: 10, // LOW: shared tier limit for testing
  },
  // STANDARD tier - shared API key with other STANDARD tenants
  STANDARD_VICTIM: {
    name: "TestStandardCorp",
    tenantId: "t-9a72f0b8",
    tier: "STANDARD",
    apiKey: __ENV.STANDARD_API_KEY,
    jwtToken: STANDARD_JWT,
    rateLimit: 15, // LOW: shared tier limit for testing
  },
  // PLATINUM tier - dedicated API key
  PLATINUM_VICTIM: {
    name: "qwerty Corp",
    tenantId: "t-cad5c200",
    tier: "PLATINUM",
    apiKey: __ENV.PLATINUM_API_KEY,
    jwtToken: PLATINUM_JWT,
    rateLimit: 50, // LOW: dedicated limit for testing
  },
  // PREMIUM tier - per-tenant API keys
  PREMIUM_NOISY: {
    name: "PremiumNoisy",
    tenantId: "t-d1cb8ca4",
    tier: "PREMIUM",
    apiKey: __ENV.PREMIUM_NOISY_API_KEY,
    jwtToken: PREMIUM_NOISY_JWT,
    rateLimit: 20, // LOW: per-tenant limit for testing
  },
  PREMIUM_VICTIM: {
    name: "PremiumCorp",
    tenantId: "t-46d6c4c8",
    tier: "PREMIUM",
    apiKey: __ENV.PREMIUM_API_KEY,
    jwtToken: PREMIUM_VICTIM_JWT,
    rateLimit: 20, // LOW: per-tenant limit for testing
  },
};

// ==================== METRICS ====================
// Scenario 1: BASIC → STANDARD
const basicNoisyRequests = new Counter("basic_noisy_requests");
const basicNoisyThrottled = new Counter("basic_noisy_throttled");
const basicNoisyLatency = new Trend("basic_noisy_latency");
const basicNoisyErrorRate = new Rate("basic_noisy_error_rate");

const standardVictimRequests = new Counter("standard_victim_requests");
const standardVictimThrottled = new Counter("standard_victim_throttled");
const standardVictimLatency = new Trend("standard_victim_latency");
const standardVictimErrorRate = new Rate("standard_victim_error_rate");

// Scenario 2: BASIC → PLATINUM
const basicNoisy2Requests = new Counter("basic_noisy2_requests");
const basicNoisy2Throttled = new Counter("basic_noisy2_throttled");
const basicNoisy2Latency = new Trend("basic_noisy2_latency");
const basicNoisy2ErrorRate = new Rate("basic_noisy2_error_rate");

const platinumVictimRequests = new Counter("platinum_victim_requests");
const platinumVictimThrottled = new Counter("platinum_victim_throttled");
const platinumVictimLatency = new Trend("platinum_victim_latency");
const platinumVictimErrorRate = new Rate("platinum_victim_error_rate");

// Scenario 3: PREMIUM → PREMIUM
const premiumNoisyRequests = new Counter("premium_noisy_requests");
const premiumNoisyThrottled = new Counter("premium_noisy_throttled");
const premiumNoisyLatency = new Trend("premium_noisy_latency");
const premiumNoisyErrorRate = new Rate("premium_noisy_error_rate");

const premiumVictimRequests = new Counter("premium_victim_requests");
const premiumVictimThrottled = new Counter("premium_victim_throttled");
const premiumVictimLatency = new Trend("premium_victim_latency");
const premiumVictimErrorRate = new Rate("premium_victim_error_rate");

// ==================== TEST OPTIONS ====================
export const options = {
  scenarios: {
    // ===== Scenario 1: BASIC → STANDARD =====
    // BASIC noisy: 6 VUs to get ~50-60% throttle with 10 req/s limit
    basic_noisy: {
      executor: "per-vu-iterations",
      vus: 6, // 6 VUs → ~15-18 req/s vs 10 req/s limit → ~40-50% throttle
      iterations: 60, // 6 VUs x 60 = 360 total requests max
      maxDuration: "60s",
      exec: "basicNoisyScenario",
      tags: { scenario: "basic_standard", role: "noisy" },
    },
    standard_victim: {
      executor: "per-vu-iterations",
      vus: 3,
      iterations: 60, // 3 VUs x 60 = 180 total requests
      maxDuration: "60s",
      exec: "standardVictimScenario",
      tags: { scenario: "basic_standard", role: "victim" },
    },

    // ===== Scenario 2: BASIC → PLATINUM =====
    basic_noisy2: {
      executor: "per-vu-iterations",
      vus: 6, // 6 VUs → ~15-18 req/s vs 10 req/s limit → ~40-50% throttle
      iterations: 60, // 6 VUs x 60 = 360 total requests max
      maxDuration: "60s",
      exec: "basicNoisy2Scenario",
      tags: { scenario: "basic_platinum", role: "noisy" },
    },
    platinum_victim: {
      executor: "per-vu-iterations",
      vus: 6, // 6 VUs - higher load, well under 50 req/s limit
      iterations: 60, // 6 VUs x 60 = 360 total requests
      maxDuration: "60s",
      exec: "platinumVictimScenario",
      tags: { scenario: "basic_platinum", role: "victim" },
    },

    // ===== Scenario 3: PREMIUM → PREMIUM =====
    premium_noisy: {
      executor: "per-vu-iterations",
      vus: 25, // 25 VUs → ~50-60 req/s vs 20 req/s limit → ~50-60% throttle
      iterations: 30, // 25 VUs x 30 = 750 total requests max
      maxDuration: "60s",
      exec: "premiumNoisyScenario",
      tags: { scenario: "premium_premium", role: "noisy" },
    },
    premium_victim: {
      executor: "per-vu-iterations",
      vus: 3,
      iterations: 60, // 3 VUs x 60 = 180 total requests
      maxDuration: "60s",
      exec: "premiumVictimScenario",
      tags: { scenario: "premium_premium", role: "victim" },
    },
  },
  thresholds: {
    // Scenario 2: PLATINUM should be isolated
    platinum_victim_error_rate: ["rate<0.05"],
    // Scenario 3: PREMIUM victim should be isolated
    premium_victim_error_rate: ["rate<0.05"],
  },
};

// ==================== REQUEST FUNCTION ====================
function makeRequest(
  tenant,
  requestCounter,
  throttledCounter,
  latencyTrend,
  errorRate,
) {
  const url = `${BASE_URL}/products`;
  const params = {
    headers: {
      "x-api-key": tenant.apiKey,
      Authorization: `Bearer ${tenant.jwtToken}`,
      "Content-Type": "application/json",
    },
    tags: { tenant: tenant.name, tier: tenant.tier },
  };

  const startTime = Date.now();
  const response = http.get(url, params);
  const duration = Date.now() - startTime;

  requestCounter.add(1);
  latencyTrend.add(duration);

  const isThrottled = response.status === 429;
  const isError = response.status >= 400;

  if (isThrottled) {
    throttledCounter.add(1);
  }

  errorRate.add(isError ? 1 : 0);

  return { status: response.status, duration, isThrottled };
}

// ==================== SCENARIO FUNCTIONS ====================
// Scenario 1: BASIC → STANDARD
export function basicNoisyScenario() {
  makeRequest(
    TENANTS.BASIC_NOISY,
    basicNoisyRequests,
    basicNoisyThrottled,
    basicNoisyLatency,
    basicNoisyErrorRate,
  );
}

export function standardVictimScenario() {
  makeRequest(
    TENANTS.STANDARD_VICTIM,
    standardVictimRequests,
    standardVictimThrottled,
    standardVictimLatency,
    standardVictimErrorRate,
  );
  sleep(0.1);
}

// Scenario 2: BASIC → PLATINUM
export function basicNoisy2Scenario() {
  makeRequest(
    TENANTS.BASIC_NOISY,
    basicNoisy2Requests,
    basicNoisy2Throttled,
    basicNoisy2Latency,
    basicNoisy2ErrorRate,
  );
}

export function platinumVictimScenario() {
  makeRequest(
    TENANTS.PLATINUM_VICTIM,
    platinumVictimRequests,
    platinumVictimThrottled,
    platinumVictimLatency,
    platinumVictimErrorRate,
  );
  sleep(0.1);
}

// Scenario 3: PREMIUM → PREMIUM
export function premiumNoisyScenario() {
  makeRequest(
    TENANTS.PREMIUM_NOISY,
    premiumNoisyRequests,
    premiumNoisyThrottled,
    premiumNoisyLatency,
    premiumNoisyErrorRate,
  );
}

export function premiumVictimScenario() {
  makeRequest(
    TENANTS.PREMIUM_VICTIM,
    premiumVictimRequests,
    premiumVictimThrottled,
    premiumVictimLatency,
    premiumVictimErrorRate,
  );
  sleep(0.1);
}

// ==================== SUMMARY ====================
export function handleSummary(data) {
  // Extract metrics
  const getMetric = (name) => {
    const m = data.metrics[name];
    return m ? m.values.count || m.values.rate || 0 : 0;
  };

  // Scenario 1: BASIC → STANDARD
  const basicNoisyTotal = getMetric("basic_noisy_requests");
  const basicNoisyThrottledCount = getMetric("basic_noisy_throttled");
  const basicNoisyRate =
    basicNoisyTotal > 0
      ? ((basicNoisyThrottledCount / basicNoisyTotal) * 100).toFixed(2)
      : "0.00";

  const standardVictimTotal = getMetric("standard_victim_requests");
  const standardVictimThrottledCount = getMetric("standard_victim_throttled");
  const standardVictimRate =
    standardVictimTotal > 0
      ? ((standardVictimThrottledCount / standardVictimTotal) * 100).toFixed(2)
      : "0.00";

  // Scenario 2: BASIC → PLATINUM
  const basicNoisy2Total = getMetric("basic_noisy2_requests");
  const basicNoisy2ThrottledCount = getMetric("basic_noisy2_throttled");
  const basicNoisy2Rate =
    basicNoisy2Total > 0
      ? ((basicNoisy2ThrottledCount / basicNoisy2Total) * 100).toFixed(2)
      : "0.00";

  const platinumVictimTotal = getMetric("platinum_victim_requests");
  const platinumVictimThrottledCount = getMetric("platinum_victim_throttled");
  const platinumVictimRate =
    platinumVictimTotal > 0
      ? ((platinumVictimThrottledCount / platinumVictimTotal) * 100).toFixed(2)
      : "0.00";

  // Scenario 3: PREMIUM → PREMIUM
  const premiumNoisyTotal = getMetric("premium_noisy_requests");
  const premiumNoisyThrottledCount = getMetric("premium_noisy_throttled");
  const premiumNoisyRate =
    premiumNoisyTotal > 0
      ? ((premiumNoisyThrottledCount / premiumNoisyTotal) * 100).toFixed(2)
      : "0.00";

  const premiumVictimTotal = getMetric("premium_victim_requests");
  const premiumVictimThrottledCount = getMetric("premium_victim_throttled");
  const premiumVictimRate =
    premiumVictimTotal > 0
      ? ((premiumVictimThrottledCount / premiumVictimTotal) * 100).toFixed(2)
      : "0.00";

  // Determine statuses
  const getStatus = (rate, isNoisy, isIsolated) => {
    const rateNum = parseFloat(rate);
    if (isNoisy) {
      return rateNum > 30 ? "✓ THROTTLED" : "⚠ LOW";
    }
    if (isIsolated) {
      return rateNum < 5 ? "✓ ISOLATED" : "✗ AFFECTED";
    }
    return rateNum > 0 ? "⚠ AFFECTED" : "✓ OK";
  };

  const summary = `
╔════════════════════════════════════════════════════════════════════════════════════════════════════╗
║                        COMPLETE NOISY NEIGHBOR TEST RESULTS                                        ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                    ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ SCENARIO 1: BASIC (noisy) → STANDARD (victim)                                               │  ║
║  │ Rate Limiting: PER-TIER (shared limits within tier)                                         │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ TENANT              │ TIER     │ REQUESTS   │ THROTTLED  │ RATE      │ STATUS              │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ BasicCorp (noisy)   │ BASIC    │ ${String(basicNoisyTotal).padStart(10)} │ ${String(basicNoisyThrottledCount).padStart(10)} │ ${String(basicNoisyRate + "%").padStart(9)} │ ${getStatus(basicNoisyRate, true, false).padEnd(19)} │  ║
║  │ StandardCorp        │ STANDARD │ ${String(standardVictimTotal).padStart(10)} │ ${String(standardVictimThrottledCount).padStart(10)} │ ${String(standardVictimRate + "%").padStart(9)} │ ${getStatus(standardVictimRate, false, false).padEnd(19)} │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                    ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ SCENARIO 2: BASIC (noisy) → PLATINUM (victim)                                               │  ║
║  │ Rate Limiting: DEDICATED (PLATINUM has own Usage Plan)                                      │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ TENANT              │ TIER     │ REQUESTS   │ THROTTLED  │ RATE      │ STATUS              │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ BasicCorp (noisy)   │ BASIC    │ ${String(basicNoisy2Total).padStart(10)} │ ${String(basicNoisy2ThrottledCount).padStart(10)} │ ${String(basicNoisy2Rate + "%").padStart(9)} │ ${getStatus(basicNoisy2Rate, true, false).padEnd(19)} │  ║
║  │ PlatinumCorp        │ PLATINUM │ ${String(platinumVictimTotal).padStart(10)} │ ${String(platinumVictimThrottledCount).padStart(10)} │ ${String(platinumVictimRate + "%").padStart(9)} │ ${getStatus(platinumVictimRate, false, true).padEnd(19)} │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                    ║
║  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  ║
║  │ SCENARIO 3: PREMIUM (noisy) → PREMIUM (victim)                                              │  ║
║  │ Rate Limiting: PER-TENANT (each PREMIUM has own Usage Plan)                                 │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ TENANT              │ TIER     │ REQUESTS   │ THROTTLED  │ RATE      │ STATUS              │  ║
║  ├─────────────────────────────────────────────────────────────────────────────────────────────┤  ║
║  │ PremiumNoisy        │ PREMIUM  │ ${String(premiumNoisyTotal).padStart(10)} │ ${String(premiumNoisyThrottledCount).padStart(10)} │ ${String(premiumNoisyRate + "%").padStart(9)} │ ${getStatus(premiumNoisyRate, true, false).padEnd(19)} │  ║
║  │ PremiumCorp         │ PREMIUM  │ ${String(premiumVictimTotal).padStart(10)} │ ${String(premiumVictimThrottledCount).padStart(10)} │ ${String(premiumVictimRate + "%").padStart(9)} │ ${getStatus(premiumVictimRate, false, true).padEnd(19)} │  ║
║  └─────────────────────────────────────────────────────────────────────────────────────────────┘  ║
║                                                                                                    ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                         ANALYSIS                                                   ║
╠════════════════════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                                    ║
║  Rate Limiting Strategy by Tier:                                                               ║
║  ┌────────────┬──────────────────────────────────────────────────────────────────────────────┐    ║
║  │ BASIC      │ Per-tier shared limit (50 req/s) - Noisy neighbor CAN affect same tier      │    ║
║  │ STANDARD   │ Per-tier shared limit (75 req/s) - Noisy neighbor CAN affect same tier      │    ║
║  │ PREMIUM    │ Per-tenant individual limit (100 req/s) - Noisy neighbor ISOLATED           │    ║
║  │ PLATINUM   │ Dedicated limit (300 req/s) - Completely ISOLATED from other tiers          │    ║
║  └────────────┴──────────────────────────────────────────────────────────────────────────────┘    ║
║                                                                                                    ║
║  Scenario 1: Different tiers (BASIC/STANDARD) have separate limits                             ║
║  Scenario 2: PLATINUM is completely isolated from BASIC noisy neighbor                         ║
║  Scenario 3: PREMIUM tenants are isolated from each other (per-tenant limits)                  ║
║                                                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════════════════════════╝
`;

  console.log(summary);

  return {
    stdout: summary,
  };
}
