import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { existsSync, writeFileSync } from "fs";
import express from "express";
import cors from "cors";

puppeteer.use(StealthPlugin());

const app = express();
app.use(cors());
app.use(express.json());

function getChromePath() {
  const paths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe"
  ].filter(Boolean);
  return paths.find((p) => existsSync(p));
}

// Site Configurations - Maximum Robustness
const SITES = [
  {
    name: "Sharaf DG",
    categories: [
      "https://uae.sharafdg.com/home-kitchen-appliances/",
      "https://uae.sharafdg.com/electronics/",
      "https://uae.sharafdg.com/phones-wearables/"
    ],
    paginationPattern: "page_number=",
    startPage: 1,
    selectors: {
      card: '[data-testid="product-card"], .product-card, .product-item, .item, .product-card-wrap',
      link: 'a',
      title: 'h2, h3, h4, .title, .name, [class*="title"]',
      price: '.price, .product-price, [data-testid="price"], [class*="price"]',
      image: 'img'
    }
  },
  {
    name: "Lulu Hypermarket",
    categories: [
      "https://gcc.luluhypermarket.com/en-ae/home-living-home-appliances/",
      "https://gcc.luluhypermarket.com/en-ae/electronics/",
      "https://gcc.luluhypermarket.com/en-ae/mobiles-tablets/"
    ],
    paginationPattern: "page=",
    startPage: 0,
    selectors: {
      card: '.product-item, .item, [data-testid="product-card"], div.rounded-lg.border, a[href*="/p/"]',
      link: 'a[href*="/p/"]',
      title: 'h2, h3, .title, .name',
      price: '.price, .current-price, [class*="price"]',
      image: 'img'
    }
  },
  {
    name: "Carrefour UAE",
    categories: [
      "https://www.carrefouruae.com/mafuae/en/c/NF4000000",
      "https://www.carrefouruae.com/mafuae/en/c/NF3000000",
      "https://www.carrefouruae.com/mafuae/en/c/NF2000000"
    ],
    paginationPattern: "currentPage=",
    startPage: 1, // Carrefour starts at 1
    selectors: {
      card: 'a[href*="/p/"], [data-testid="product_card"], .product-card',
      link: 'a',
      title: 'span, .title, h3, h4',
      price: '[data-testid="price"], .css-1n9n6n9, .price',
      image: 'img'
    }
  },
  {
    name: "Amazon AE",
    categories: [
      "https://www.amazon.ae/s?k=home+appliances",
      "https://www.amazon.ae/s?k=electronics",
      "https://www.amazon.ae/s?k=mobiles"
    ],
    paginationPattern: "page=",
    startPage: 1,
    selectors: {
      card: '[data-component-type="s-search-result"], .s-result-item, .s-card-container',
      link: 'h2 a',
      title: 'h2 a span, .a-size-base-plus',
      price: 'span.a-price-whole, .a-price',
      image: 'img.s-image'
    }
  },
  {
    name: "Rattan Elect",
    categories: [
      "https://rattanelect.com/product-tag/home-appliances/",
      "https://rattanelect.com/product-tag/electronics/"
    ],
    paginationPattern: "page/",
    isPathPagination: true,
    startPage: 1,
    selectors: {
      card: 'li.product, .product-item',
      link: 'a',
      title: '.woocommerce-loop-product__title, h2, h3',
      price: '.price, .woocommerce-Price-amount',
      image: 'img'
    }
  }
];

let cachedProducts = [];
let lastScrapeTime = null;
const CACHE_DURATION = 30 * 60 * 1000; 

async function scrapeCategory(browser, siteConfig, categoryUrl) {
  console.log(`\n📡 [${siteConfig.name}] Exploring: ${categoryUrl}`);
  const page = await browser.newPage();
  
  // High-def viewport to trigger more content
  await page.setViewport({ width: 1600, height: 1000 });
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36");

  const results = [];
  const maxPages = 15;

  for (let i = 0; i < maxPages; i++) {
    const pageNum = siteConfig.startPage + i;
    const cleanBase = categoryUrl.replace(/\/+$/, "").replace(/\?+$/, "");
    let pageUrl = cleanBase;
    
    if (i > 0 || siteConfig.startPage !== 0) {
      if (siteConfig.isPathPagination) {
        pageUrl = `${cleanBase}/${siteConfig.paginationPattern}${pageNum}/`;
      } else {
        const separator = cleanBase.includes("?") ? "&" : "?";
        pageUrl = `${cleanBase}${separator}${siteConfig.paginationPattern}${pageNum}`;
      }
    }

    console.log(`   - [${siteConfig.name}] Loading Page ${pageNum}...`);
    try {
      // Extra stealth delay
      if (i > 0) await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
      
      const response = await page.goto(pageUrl, { 
          waitUntil: ["networkidle2", "domcontentloaded"], 
          timeout: 90000 
      });

      // Simple bypass for "Press & Hold" screens - just wait for them to clear or for content to appear
      await new Promise(r => setTimeout(r, 4000));

      // Scroll with variable speed to look human
      await page.evaluate(async () => {
        for (let j = 0; j < 10; j++) {
            const amount = 500 + Math.random() * 500;
            window.scrollBy(0, amount);
            await new Promise(r => setTimeout(r, 400 + Math.random() * 400));
        }
      });

      // Dynamic Selector Strategy
      const products = await page.evaluate((config) => {
        const items = [];
        const seen = new Set();
        
        // Strategy 1: Configured Selector
        let cards = document.querySelectorAll(config.selectors.card);
        
        // Strategy 2: If fail, try broad "product" classes
        if (cards.length < 5) {
            cards = document.querySelectorAll('.product, .item, .card, [class*="product"]');
        }

        if (!cards.length) return [];

        for (const card of Array.from(cards)) {
          const anchor = card.tagName === "A" ? card : (card.querySelector('a') || card.closest('a'));
          if (!anchor || !anchor.href) continue;

          let url = anchor.href;
          if (seen.has(url)) continue;
          seen.add(url);

          const scope = card;
          const title = (
              scope.querySelector(config.selectors.title)?.innerText || 
              anchor.innerText || 
              scope.querySelector('h2, h3, h4')?.innerText || 
              ""
          ).trim();

          const price = (
              scope.querySelector(config.selectors.price)?.innerText || 
              scope.querySelector('[class*="price"]')?.innerText || 
              ""
          ).trim();

          const img = scope.querySelector(config.selectors.image) || scope.querySelector('img');
          let image = img?.src || img?.getAttribute('data-src') || img?.getAttribute('srcset')?.split(' ')[0] || "";
          
          if (image.startsWith("//")) image = "https:" + image;

          if (title && title.length > 5 && (price || image)) {
            items.push({ title, price, image, url, source: config.name });
          }
        }
        return items;
      }, siteConfig);

      if (products.length === 0) {
          console.log(`   - [${siteConfig.name}] No products caught on page ${pageNum}. Ending crawl.`);
          break;
      }

      const unique = products.filter(p => !results.some(existing => existing.url === p.url));
      results.push(...unique);
      console.log(`   - [${siteConfig.name}] Syncing ${unique.length} new items (Global: ${results.length})`);
      
      if (unique.length === 0 && i > 0) break; 

    } catch (e) {
      console.error(`   - ❌ [${siteConfig.name}] Failed page ${pageNum}: ${e.message}`);
      break;
    }
  }

  await page.close();
  return results;
}

async function scrapeEverything() {
  let browser;
  try {
    const chromePath = getChromePath();
    console.log("🛠️  Waking up the Master Scraper...");
    browser = await puppeteer.launch({
      headless: false,
      executablePath: chromePath || undefined,
      args: [
          "--no-sandbox", 
          "--disable-setuid-sandbox", 
          "--disable-blink-features=AutomationControlled",
          "--start-maximized"
      ]
    });

    const finalResults = [];
    // Sequential process for maximum safety against site-wide bans
    for (const site of SITES) {
        console.log(`\n--- 🏢 SYNCING RETAILER: ${site.name} ---`);
        for (const url of site.categories) {
            const data = await scrapeCategory(browser, site, url);
            finalResults.push(...data);
        }
    }

    console.log(`\n✅ ALL SITES SYNCED: ${finalResults.length} total listings in catalog.`);
    return finalResults.map((p, idx) => ({ id: idx + 1, ...p }));
  } catch (err) {
    console.error("Critical System Failure:", err);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

app.get("/api/products", async (req, res) => {
  try {
    if (cachedProducts.length > 0 && lastScrapeTime && (Date.now() - lastScrapeTime < CACHE_DURATION)) {
      return res.json({ success: true, count: cachedProducts.length, cached: true, products: cachedProducts });
    }
    cachedProducts = await scrapeEverything();
    lastScrapeTime = Date.now();
    res.json({ success: true, count: cachedProducts.length, cached: false, products: cachedProducts });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get("/api/products/refresh", async (req, res) => {
    try {
      cachedProducts = await scrapeEverything();
      lastScrapeTime = Date.now();
      res.json({ success: true, count: cachedProducts.length, products: cachedProducts });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

app.get("/api/image-proxy", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) return res.status(400).send("No URL");
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0..." } });
    const buffer = await resp.arrayBuffer();
    res.setHeader("Content-Type", resp.headers.get("content-type") || "image/jpeg");
    res.send(Buffer.from(buffer));
  } catch (err) { res.status(500).send("Proxy error"); }
});

const PORT = 3001;
app.listen(PORT, () => console.log(`🚀 MASTER ENGINE: http://localhost:${PORT}`));
