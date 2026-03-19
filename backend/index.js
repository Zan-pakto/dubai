import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { existsSync, writeFileSync } from "fs";

// Add stealth plugin to puppeteer
puppeteer.use(StealthPlugin());

function getChromePath() {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  return paths.find((p) => existsSync(p));
}

const CONFIG = {
  maxPagesPerCategory: 5,
  concurrency: 2,
  outputFile: "sharaf_products.json",
  chromePath: getChromePath()
};

const CATEGORIES = [
  { name: "Mobiles & Tablets", url: "https://uae.sharafdg.com/c/mobiles-tablets/" },
  { name: "Computing", url: "https://uae.sharafdg.com/c/computing/" },
  { name: "Home Appliances", url: "https://uae.sharafdg.com/c/major-appliances/" },
  { name: "Television & Video", url: "https://uae.sharafdg.com/c/television-video/" },
  { name: "Personal Care", url: "https://uae.sharafdg.com/c/personal-care/" }
];

async function scrapePage(page, url) {
  console.log(`Scraping: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for product cards to appear (Algolia based)
    await page.waitForFunction(
      () => {
        const productLinks = document.querySelectorAll('a[href*="/product/"]');
        return productLinks.length >= 2;
      },
      { timeout: 20000 }
    ).catch(() => console.log("Timeout waiting for Sharaf DG links on " + url));

    // Scroll to load all components
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        window.scrollBy(0, window.innerHeight);
        await new Promise((r) => setTimeout(r, 1000));
      }
    });

    const products = await page.evaluate(() => {
      const results = [];
      const seen = new Set();
      
      const selectors = [
        '[data-testid="product-card"]',
        '[class*="product-card"]',
        '[class*="ProductCard"]',
        '[class*="product-item"]',
        'a[href*="/product/"]'
      ];

      let cards = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 2) {
          cards = [...els];
          break;
        }
      }
      
      if (cards.length === 0) cards = [...document.querySelectorAll('a[href*="/product/"]')];

      for (const card of cards) {
        const linkEl = card.tagName === "A" ? card : card.querySelector('a[href*="/product/"]');
        if (!linkEl) continue;

        const url = linkEl.href;
        if (!url || seen.has(url)) continue;
        seen.add(url);

        const container = card.tagName === "A" ? card : card.closest("a") || card;

        const title =
          container.querySelector("h2, h3, h4")?.innerText?.trim() ||
          container.querySelector("[class*='title'], [class*='name']")?.innerText?.trim() ||
          linkEl.innerText?.trim();

        const priceEl =
          container.querySelector("[data-testid='price'], [class*='price'], [class*='Price'], .price");
        let price = priceEl?.innerText?.replace(/\s+/g, " ").trim() || "";
        // Normalize Sharaf DG price "AED 1,000"
        price = price.split(/\s+D\s+/)[0]?.replace(/^D\s*/, "AED ") || price;

        const img = container.querySelector("img");
        let image = img?.src || img?.getAttribute("data-src") || img?.getAttribute("srcset")?.split(" ")[0] || "";
        if (image.startsWith("//")) image = "https:" + image;

        if (title || price) {
          results.push({ title: title || "N/A", price: price || "N/A", image, url });
        }
      }
      return results;
    });

    return products;
  } catch (err) {
    console.error(`Error scraping ${url}: ${err.message}`);
    return [];
  }
}

async function scrapeCategory(browser, category) {
  const allCategoryProducts = [];
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");

  let currentPage = 1; // Sharaf DG uses 1-based indexing for p=X
  let hasMore = true;

  while (hasMore && (CONFIG.maxPagesPerCategory === 0 || currentPage <= CONFIG.maxPagesPerCategory)) {
    const pageUrl = currentPage === 1 ? category.url : `${category.url}?p=${currentPage}`;
    console.log(`Sharaf DG Category: ${category.name} | Page: ${currentPage}`);
    
    const products = await scrapePage(page, pageUrl);
    
    if (products.length === 0) {
      console.log(`No more products found for Sharaf DG: ${category.name}`);
      hasMore = false;
    } else {
      // Check for duplicates
      const newProducts = products.filter(p => !allCategoryProducts.some(ap => ap.url === p.url));
      if (newProducts.length === 0 && currentPage > 1) {
        console.log(`Duplicate page detected for ${category.name} at page ${currentPage}. Stopping.`);
        hasMore = false;
      } else {
        allCategoryProducts.push(...newProducts);
        currentPage++;
        await new Promise(r => setTimeout(r, 2000)); // Polite delay
      }
    }
  }

  await page.close();
  return allCategoryProducts;
}

(async () => {
  let browser;
  try {
    console.log("Starting Sharaf DG Master Scraper...");
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CONFIG.chromePath || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
    });

    const allProducts = [];

    for (let i = 0; i < CATEGORIES.length; i += CONFIG.concurrency) {
      const chunk = CATEGORIES.slice(i, i + CONFIG.concurrency);
      const results = await Promise.all(chunk.map(cat => scrapeCategory(browser, cat)));
      results.forEach(res => allProducts.push(...res));
    }

    console.log(`\nSharaf DG Scraping complete! Total products found: ${allProducts.length}`);
    
    writeFileSync(CONFIG.outputFile, JSON.stringify(allProducts, null, 2));
    console.log(`Results saved to ${CONFIG.outputFile}`);

  } catch (err) {
    console.error("Main error:", err.message);
  } finally {
    if (browser) await browser.close();
  }
})();
