import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { existsSync, writeFileSync, readFileSync } from "fs";
import path from "path";

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
  maxPagesPerCategory: 5, // Set to 0 or null for all pages
  concurrency: 2,
  outputFile: "lulu_products.json",
  chromePath: getChromePath()
};

const CATEGORIES = [
  { name: "Mobiles & Electronics", url: "https://www.luluhypermarket.com/en-ae/mobi-electronics/c/HY00214771" },
  { name: "Grocery", url: "https://www.luluhypermarket.com/en-ae/grocery/c/HY00214736" },
  { name: "Home & Living", url: "https://www.luluhypermarket.com/en-ae/home-living/c/HY00214781" },
  { name: "Appliances", url: "https://www.luluhypermarket.com/en-ae/home-appliances/c/HY00214775" },
  { name: "Beauty", url: "https://www.luluhypermarket.com/en-ae/beauty-wellness/c/HY00214811" }
];

async function scrapePage(page, url) {
  console.log(`Scraping: ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for product cards to appear
    await page.waitForFunction(
      () => {
        const productLinks = document.querySelectorAll('a[href*="/p/"], a[href*="/product/"]');
        return productLinks.length >= 2;
      },
      { timeout: 15000 }
    ).catch(() => console.log("Timeout waiting for links on " + url));

    // Scroll to load lazy images
    await page.evaluate(async () => {
      for (let i = 0; i < 3; i++) {
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
        'a[href*="/product/"]',
        'a[href*="/p/"]'
      ];

      let cards = [];
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 3) {
          cards = [...els];
          break;
        }
      }
      
      if (cards.length === 0) cards = [...document.querySelectorAll('a[href*="/p/"]')];

      for (const card of cards) {
        const linkEl = card.tagName === "A" ? card : card.querySelector('a[href*="/product/"], a[href*="/p/"]');
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
          container.querySelector("[data-testid='price'], [class*='price'], [class*='Price']");
        let price = priceEl?.innerText?.replace(/\s+/g, " ").trim() || "";
        // Clean up price string "D 10.00" -> "AED 10.00"
        price = price.split(/\s+D\s+/)[0]?.replace(/^D\s*/, "AED ") || price;

        const img = container.querySelector("img");
        let image = img?.src || img?.getAttribute("data-src") || "";
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

  let currentPage = 0;
  let hasMore = true;

  while (hasMore && (CONFIG.maxPagesPerCategory === 0 || currentPage < CONFIG.maxPagesPerCategory)) {
    const pageUrl = `${category.url}?page=${currentPage}`;
    console.log(`Category: ${category.name} | Page: ${currentPage}`);
    
    const products = await scrapePage(page, pageUrl);
    
    if (products.length === 0) {
      console.log(`No more products found for ${category.name}`);
      hasMore = false;
    } else {
      // Small check: if we got all duplicate URLs, it might be the same page repeating
      const newProducts = products.filter(p => !allCategoryProducts.some(ap => ap.url === p.url));
      if (newProducts.length === 0) {
        console.log(`Duplicate page detected for ${category.name}. Stopping.`);
        hasMore = false;
      } else {
        allCategoryProducts.push(...newProducts);
        currentPage++;
        // Polite delay
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  await page.close();
  return allCategoryProducts;
}

(async () => {
  let browser;
  try {
    console.log("Starting Lulu Master Scraper...");
    browser = await puppeteer.launch({
      headless: "new",
      executablePath: CONFIG.chromePath || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
    });

    const allProducts = [];

    // Process categories with limited concurrency
    for (let i = 0; i < CATEGORIES.length; i += CONFIG.concurrency) {
      const chunk = CATEGORIES.slice(i, i + CONFIG.concurrency);
      const results = await Promise.all(chunk.map(cat => scrapeCategory(browser, cat)));
      results.forEach(res => allProducts.push(...res));
    }

    console.log(`\nScraping complete! Total products found: ${allProducts.length}`);
    
    // Save to file
    writeFileSync(CONFIG.outputFile, JSON.stringify(allProducts, null, 2));
    console.log(`Results saved to ${CONFIG.outputFile}`);

  } catch (err) {
    console.error("Main error:", err.message);
  } finally {
    if (browser) await browser.close();
  }
})();
