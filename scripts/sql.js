const fs = require("fs");
const https = require("https");

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = "uwtqbqtryozeboafzgwo";
const query = process.argv[2];

if (!token || !query) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=... node scripts/sql.js \"select 1\"");
  process.exit(1);
}

const body = JSON.stringify({ query });
const req = https.request(
  {
    hostname: "api.supabase.com",
    path: `/v1/projects/${ref}/database/query`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log(data);
      process.exit(res.statusCode && res.statusCode < 300 ? 0 : 1);
    });
  },
);
req.on("error", (e) => {
  console.error(e);
  process.exit(1);
});
req.write(body);
req.end();
