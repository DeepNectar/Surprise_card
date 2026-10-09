const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = "/workspace/";

const html = fs.readFileSync(path + "index.html", "utf8");
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1]);
console.log("Scripts:", scripts.length);

const dom = new JSDOM(html, { url: "https://test.local/index.html", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;

w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }));
w.IntersectionObserver = class { constructor(cb){this.cb=cb;} observe(){} unobserve(){} disconnect(){} };
w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
w.scrollTo = () => {};
w.fetch = (...a) => Promise.reject(new Error("no fetch in test"));
w.alert = () => {};
w.confirm = () => true;
w.prompt = (m, d) => d || "test";

const errors = [];
w.addEventListener("error", e => errors.push("[window.error] " + (e.error && e.error.stack ? e.error.stack : e.message)));
process.on("unhandledRejection", r => errors.push("[unhandled] " + (r && r.stack || r)));

for (const s of scripts) {
  const file = path + s;
  if (!fs.existsSync(file)) { console.log("MISSING FILE:", s); continue; }
  const code = fs.readFileSync(file, "utf8");
  try { w.eval(code + "\n//# sourceURL=" + s); console.log("OK   ", s); }
  catch (e) { console.log("THROW", s, "::", e.message); errors.push("[eval " + s + "] " + e.stack); }
}

try {
  w.document.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  w.dispatchEvent(new w.Event("load"));
} catch(e){ errors.push("[ready-fire] " + e.stack); }

setTimeout(() => {
  console.log("\n=== ERRORS (" + errors.length + ") ===");
  errors.slice(0, 40).forEach(e => console.log(String(e).split("\n").slice(0,5).join("\n"), "\n---"));
  process.exit(0);
}, 3000);
