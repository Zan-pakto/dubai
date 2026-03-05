import puppeteer from "puppeteer";
import { existsSync } from "fs";
import express from "express";
import cors from "cors";

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

// Cache for scraped products
let cachedProducts = [];
let lastScrapeTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function scrapeProducts() {
  let browser;
  try {
    const chromePath = getChromePath();
    browser = await puppeteer.launch({
      headless: "new",
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
        let image = img?.src || img?.getAttribute("data-src") || "";
        // Fix protocol-relative URLs
        if (image.startsWith("//")) image = "https:" + image;

        if (title || price) {
          results.push({
            id: results.length + 1,
            title: title || "N/A",
            price: price || "N/A",
            image: image || "",
            url
          });
        }
      }

      return results;
    });

    return products;
  } catch (err) {
    console.error("Scraper error:", err.message);
    throw err;
  } finally {
    if (browser) await browser.close();
  }
}

// API endpoint to get products
app.get("/api/products", async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached data if still valid
    if (cachedProducts.length > 0 && lastScrapeTime && (now - lastScrapeTime < CACHE_DURATION)) {
      console.log("Returning cached products...");
      return res.json({
        success: true,
        count: cachedProducts.length,
        cached: true,
        products: cachedProducts
      });
    }

    console.log("Scraping fresh products...");
    cachedProducts = await scrapeProducts();
    lastScrapeTime = now;

    res.json({
      success: true,
      count: cachedProducts.length,
      cached: false,
      products: cachedProducts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to force refresh
app.get("/api/products/refresh", async (req, res) => {
  try {
    console.log("Force refreshing products...");
    cachedProducts = await scrapeProducts();
    lastScrapeTime = Date.now();

    res.json({
      success: true,
      count: cachedProducts.length,
      products: cachedProducts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Image proxy to avoid hotlinking issues with Sharaf DG images
app.get("/api/image-proxy", async (req, res) => {
  try {
    const imageUrl = req.query.url;
    if (!imageUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Referer": "https://uae.sharafdg.com/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: "Failed to fetch image" });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 24 hours

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    res.status(500).json({ error: "Image proxy error" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📦 Products API: http://localhost:${PORT}/api/products`);
  console.log(`🖼️  Image Proxy: http://localhost:${PORT}/api/image-proxy?url=...`);
});
