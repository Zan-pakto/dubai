import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
console.log("Imports successful!");
puppeteer.use(StealthPlugin());
console.log("Stealth plugin added!");
(async () => {
  console.log("Starting browser...");
  const browser = await puppeteer.launch({ headless: "new" });
  console.log("Browser launched!");
  await browser.close();
})();
