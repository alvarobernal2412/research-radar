// Stand-in for an agent CLI in tests. Answers like a model that wraps JSON in prose.
// With --radar it behaves like run_scan.py: records its arguments and request text, then exits.
const fs = require("fs");
const args = process.argv.slice(2);
if (args.includes("--radar")) {
  const out = process.env.FAKE_SCAN_OUT;
  fs.writeFileSync(out, JSON.stringify({ args, text: process.env.RADAR_REQUEST_TEXT || "", url: process.env.RADAR_URL || "" }));
  setTimeout(() => process.exit(0), +process.env.FAKE_SCAN_MS || 0);
} else {
  let s = "";
  process.stdin.on("data", (d) => { s += d; });
  process.stdin.on("end", () => console.log('Sure, here is the profile:\n{"description":"ok","themes":[{"name":"Fake theme","weight":1,"keywords":["k"]}],"len":' + s.length + "}"));
}
