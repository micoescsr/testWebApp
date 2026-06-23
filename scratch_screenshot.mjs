import { chromium } from "playwright";
import path from "path";

const fixturePath = path.resolve(process.argv[2]);
const outPath = path.resolve(process.argv[3]);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 500 } });
await page.goto("file:///" + fixturePath.replace(/\\/g, "/"));
await page.screenshot({ path: outPath });
await browser.close();
console.log("Saved:", outPath);
