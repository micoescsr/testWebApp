// test-pi-signing.js — one-off connectivity test
// Run: node test-pi-signing.js

require("dotenv").config();
const crypto = require("crypto");

const PI_BASE_URL = process.env.PI_BASE_URL;
const SECRET = process.env.CONTROL_SIGNING_SECRET;

console.log("PI_BASE_URL:", PI_BASE_URL);
console.log("SECRET present:", !!SECRET, `(${SECRET?.length} chars)`);

function buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret }) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  const bodyHashHex = crypto.createHash("sha256").update(bodyBytes).digest("hex");
  const canonical = `${method.toUpperCase()}\n${pathWithQuery}\n${ts}\n${nonce}\n${bodyHashHex}`;
  const sigHex = crypto
    .createHmac("sha256", Buffer.from(secret, "utf8"))
    .update(Buffer.from(canonical, "utf8"))
    .digest("hex");

  console.log("\n--- Signing debug ---");
  console.log("method:", method);
  console.log("pathWithQuery:", pathWithQuery);
  console.log("ts:", ts);
  console.log("nonce:", nonce);
  console.log("bodyHash:", bodyHashHex);
  console.log("canonical:\n" + canonical);
  console.log("signature:", sigHex);
  console.log("---------------------\n");

  return {
    "X-Control-Timestamp": ts,
    "X-Control-Nonce": nonce,
    "X-Control-Body-SHA256": bodyHashHex,
    "X-Control-Signature": sigHex,
  };
}

async function main() {
  const pathWithQuery = "/device/status";
  const method = "GET";
  const bodyBytes = Buffer.alloc(0);

  const signed = buildSignedHeaders({ method, pathWithQuery, bodyBytes, secret: SECRET });

  // Try both: Funnel (HTTPS) and direct nginx (9000)
  const urls = [
    `${PI_BASE_URL}${pathWithQuery}`,
    `http://mothership-1.tail781e52.ts.net:9000${pathWithQuery}`,
  ];

  for (const url of urls) {
    console.log("\n========================================");
    console.log("Fetching:", url);
    console.log("Headers:", JSON.stringify(signed, null, 2));

    try {
      const res = await fetch(url, { method, headers: signed });
      const text = await res.text();
      console.log(`Response status: ${res.status}`);
      console.log("Response body:", text);
    } catch (err) {
      console.error("Fetch error:", err.message);
    }
  }
}

main();
