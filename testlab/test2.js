const { JSDOM } = require("jsdom");
const fs = require("fs");
const base = "/workspace/";
const html = fs.readFileSync(base + "index.html", "utf8");
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*>/g)].map(m => m[1]);

const dom = new JSDOM(html, { url: "https://test.local/index.html?event=demo", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window; const d = w.document;
w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} });
w.IntersectionObserver = class { constructor(cb){} observe(){} unobserve(){} disconnect(){} };
w.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
w.scrollTo = () => {};
w.fetch = () => Promise.reject(new Error("no fetch"));
w.alert = () => {}; w.confirm = () => true; w.prompt = (m,x) => x || "test";
w.HTMLCanvasElement.prototype.getContext = function(){ return null; };
try { w.HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,"; } catch(e){}

const errs = [];
w.addEventListener("error", e => errs.push("[error] " + (e.error && e.error.stack ? e.error.stack : e.message)));
w.addEventListener("unhandledrejection", e => {});

for (const s of scripts) {
  const code = fs.readFileSync(base + s, "utf8");
  try { w.eval(code + "\n//# sourceURL=" + s); } catch (e) { errs.push("[eval "+s+"] "+e.message); }
}
d.dispatchEvent(new w.Event("DOMContentLoaded", {bubbles:true}));
w.dispatchEvent(new w.Event("load"));

setTimeout(() => {
  // find clickable things: buttons, [data-action], nav links
  const clickables = [...d.querySelectorAll("button, [role=button], a[href^='#'], [data-action], .clickable")];
  console.log("Clickables found:", clickables.length);
  const clicked = [];
  for (const el of clickables.slice(0, 60)) {
    const label = (el.id || el.getAttribute("data-action") || el.className || el.tagName) + "";
    try {
      el.click();
      clicked.push(label.slice(0,60));
    } catch (e) {
      errs.push("[click " + label.slice(0,40) + "] " + e.stack.split("\n").slice(0,3).join(" | "));
    }
  }
  console.log("Clicked:", clicked.length);
  setTimeout(() => {
    console.log("=== ERRORS (" + errs.length + ") ===");
    errs.slice(0,30).forEach(e => console.log(String(e).split("\n").slice(0,5).join("\n"), "---"));
    process.exit(0);
  }, 1500);
}, 1500);
