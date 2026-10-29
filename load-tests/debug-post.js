import http from "k6/http";

// API URL comes from an environment variable (see .env.example). No
// x-api-key header: the authorizer selects the tenant's usage plan.
const BASE_URL = __ENV.BASE_URL;
const BASIC_JWT = __ENV.BASIC_TOKEN || "";

export default function () {
  const headers = {
    Authorization: `Bearer ${BASIC_JWT}`,
    "Content-Type": "application/json",
  };

  const product = {
    sku: "TEST-" + Date.now(),
    name: "Test Product",
    price: 100,
    category: { id: "cat-1", name: "Test" },
  };

  console.log("=== Sending POST request ===");
  const res = http.post(`${BASE_URL}/products`, JSON.stringify(product), {
    headers,
  });
  console.log("Status:", res.status);
  console.log("Body:", res.body);

  if (res.status === 200 && res.body) {
    try {
      const body = JSON.parse(res.body);
      console.log("=== Parsed Response ===");
      console.log("shardId:", body.shardId);
      console.log("productId:", body.productId);
      console.log("sku:", body.sku);
      console.log("name:", body.name);

      if (body.shardId && body.productId) {
        const key = `${body.shardId}:${body.productId}`;
        console.log("=== Constructed key:", key);

        // Now test GET with this key
        console.log("=== Testing GET with key ===");
        const getRes = http.get(`${BASE_URL}/products/${key}`, { headers });
        console.log("GET Status:", getRes.status);
        console.log("GET Body:", getRes.body);
      } else {
        console.log("ERROR: Missing shardId or productId!");
        console.log("Full body keys:", Object.keys(body));
      }
    } catch (e) {
      console.log("Parse error:", e.message);
    }
  }
}

export const options = {
  iterations: 1,
  vus: 1,
};
