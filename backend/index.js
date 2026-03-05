import puppeteer from "puppeteer";
import { existsSync } from "fs";

function getChromePath() {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  return paths.find((p) => existsSync(p));
}

(async () => {
  let browser;
  try {
    const chromePath = getChromePath();
    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath || undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );

    const url = "https://uae.sharafdg.com/c/home_appliances/";
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 60000
    });

    await page.waitForFunction(
      () => {
        const productLinks = document.querySelectorAll('a[href*="/product/"]');
        return productLinks.length >= 3;
      },
      { timeout: 30000 }
    );

    await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise((r) => setTimeout(r, 2000));
      }
    });

    const products = await page.evaluate(() => {
      const results = [];
      const seen = new Set();

      const selectors = [
        '[data-testid="product-card"]',
        '[class*="product-card"]',
        '[class*="ProductCard"]',
        'a[href*="/product/"]'
      ];

      let cards = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          cards = [...els];
          break;
        }
      }

      for (const card of cards) {
        const linkEl = card.matches("a") ? card : card.querySelector('a[href*="/product/"]');
        if (!linkEl) continue;

        const url = linkEl.href || linkEl.getAttribute("href") || "";
        if (!url.includes("/product/") || seen.has(url)) continue;
        seen.add(url);

        const container = card.matches("a") ? card : card.closest("a") || card;

        const title =
          container.querySelector("h2")?.innerText?.trim() ||
          container.querySelector("h3")?.innerText?.trim() ||
          container.querySelector("h4")?.innerText?.trim() ||
          container.querySelector("[class*='title']")?.innerText?.trim() ||
          container.querySelector("[class*='name']")?.innerText?.trim();

        const priceEl =
          container.querySelector("[data-testid='price']") ||
          container.querySelector("[class*='price']") ||
          container.querySelector("[class*='Price']");
        let price = priceEl?.innerText?.replace(/\s+/g, " ").trim() || "";
        price = price.split(/\s+D\s+/)[0]?.replace(/^D\s*/, "AED ") || price;

        const img = container.querySelector("img");
        const image = img?.src || img?.getAttribute("data-src") || "";

        if (title || price) {
          results.push({
            title: title || "N/A",
            price: price || "N/A",
            image: image || "",
            url
          });
        }
      }

      return results;
    });

    console.log("Total products:", products.length);
    console.log(JSON.stringify(products.slice(0, 10), null, 2));
  } catch (err) {
    console.error("Scraper error:", err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
})();
