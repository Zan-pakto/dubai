"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import "./page.css";

// ─── Types ─────────────────────────────────────────────
interface ScrapedProduct {
  id: number;
  title: string;
  price: string;
  image: string;
  url: string;
  source: string;
}

interface TrackedProduct {
  scraped: ScrapedProduct;
  scrapedPriceNum: number;
  ourPrice: number;
  priceDiff: number;
  priceDiffPct: number;
  isRivalCheaper: boolean;
}

// ─── Helpers ─────────────────────────────────────────
function parsePriceToNumber(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatAED(num: number): string {
  return `AED ${num.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SOURCES = ["Amazon AE", "Carrefour UAE", "Sharaf DG", "Lulu Hypermarket", "Rattan Elect"];

export default function UnifiedDashboard() {
  const [products, setProducts] = useState<ScrapedProduct[]>([]);
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  const API_URL = "http://localhost:3001";

  // Build simulated "Our Price" logic
  const buildTrackedList = useCallback((scraped: ScrapedProduct[]) => {
    return scraped.map((p) => {
      const spNum = parsePriceToNumber(p.price);
      // Simulate our catalog price (roughly same range)
      const ourPrice = Math.round(spNum * (0.95 + Math.random() * 0.1) * 10) / 10;
      const diff = ourPrice - spNum;
      const pct = ourPrice > 0 ? (diff / ourPrice) * 100 : 0;
      
      return {
        scraped: p,
        scrapedPriceNum: spNum,
        ourPrice,
        priceDiff: diff,
        priceDiffPct: Math.round(pct * 100) / 100,
        isRivalCheaper: spNum < ourPrice
      };
    });
  }, []);

  const fetchProducts = useCallback(async (force = false) => {
    try {
      force ? setIsRefreshing(true) : setLoading(true);
      setError(null);

      const res = await fetch(`${API_URL}/api/products${force ? '/refresh' : ''}`);
      const data = await res.json();

      if (data.success && data.products) {
        setProducts(data.products);
        setTrackedProducts(buildTrackedList(data.products));
        setLastScanTime(new Date());
      } else {
        setError(data.error || "No data received");
      }
    } catch (err) {
      setError("Connect to Backend at 3001");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [buildTrackedList]);

  useEffect(() => { fetchProducts(); }, []);

  const filtered = useMemo(() => {
    return trackedProducts.filter(t => {
      const matchesSource = selectedSource === "all" || t.scraped.source === selectedSource;
      const matchesSearch = t.scraped.title.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSource && matchesSearch;
    });
  }, [trackedProducts, selectedSource, searchQuery]);

  // Stats
  const rivalWins = trackedProducts.filter(t => t.isRivalCheaper).length;
  const ourWins = trackedProducts.length - rivalWins;
  const avgGap = trackedProducts.reduce((acc, t) => acc + t.priceDiffPct, 0) / (trackedProducts.length || 1);

  if (loading) return (
    <div className="demo-loading-screen">
      <div className="demo-loading-spinner" />
      <h2 className="demo-loading-title">UAE Price Monitoring</h2>
      <p className="demo-loading-subtitle">Syncing with Amazon, Carrefour, Lulu, Sharaf and Rattan...</p>
    </div>
  );

  return (
    <div className="min-h-screen p-6">
      <div className="demo-bg" />
      
      <header className="demo-header">
        <div className="demo-header-left">
          <div className="demo-badge">REAL-TIME</div>
          <div>
            <h1 className="demo-title"><span className="header-gradient">PriceWatch</span> Dashboard</h1>
            <p className="demo-subtitle">Multi-retailer price comparison engine — Live from Dubai</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
            <div className="live-indicator"><span className="live-dot" /> LIVE 5 SITES</div>
            <button className="simulate-btn" onClick={() => fetchProducts(true)} disabled={isRefreshing}>
                {isRefreshing ? "Scanning..." : "Sync All Sources"}
            </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-icon stat-icon-blue">📈</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Total Listings</span>
            <span className="stat-card-value">{products.length}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon stat-icon-red">💸</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Rival Cheaper</span>
            <span className="stat-card-value text-red-500">{rivalWins}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon stat-icon-green">🎯</div>
          <div className="stat-card-info">
            <span className="stat-card-label">You're Cheaper</span>
            <span className="stat-card-value text-green-500">{ourWins}</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-icon stat-icon-purple">📊</div>
          <div className="stat-card-info">
            <span className="stat-card-label">Avg. Margin Gap</span>
            <span className="stat-card-value">{avgGap.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="charts-section">
        <div className="chart-card">
          <h3 className="chart-title">Market Dominance</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={[{name:"You", value:ourWins}, {name:"Rivals", value:rivalWins}]} cx="50%" cy="50%" innerRadius={60} outerRadius={80} dataKey="value">
                <Cell fill="#16a34a" /><Cell fill="#7c3aed" />
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">Live Price Deltas (Top 10)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={trackedProducts.slice(0, 10).map(t => ({ name: t.scraped.title.substring(0, 15), "Our Price": t.ourPrice, "Competitor": t.scrapedPriceNum }))}>
              <XAxis dataKey="name" fontSize={10} angle={-15} textAnchor="end" height={40} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Bar dataKey="Our Price" fill="#16a34a" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Competitor" fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="category-filter">
          <button className={`category-pill ${selectedSource === 'all' ? 'active' : ''}`} onClick={() => setSelectedSource('all')}>All Sites</button>
          {SOURCES.map(s => (
              <button key={s} className={`category-pill ${selectedSource === s ? 'active' : ''}`} onClick={() => setSelectedSource(s)}>{s}</button>
          ))}
          <div className="search-box">
              <input type="text" placeholder="Filter products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="search-input" />
          </div>
      </div>

      <div className="comparison-grid">
        {filtered.map((t, idx) => (
          <div key={`${t.scraped.id}-${idx}`} className={`comparison-card p-4 ${t.isRivalCheaper ? 'rival-winning' : 'our-winning'}`}>
            <div className="flex items-start gap-4 mb-4">
              <div className="product-image-wrap">
                <img src={`http://localhost:3001/api/image-proxy?url=${encodeURIComponent(t.scraped.image)}`} alt="" className="product-image" onError={(e) => (e.currentTarget.src = t.scraped.image)} />
              </div>
              <div className="flex flex-col gap-1 min-w-0">
                <span className={`source-badge ${t.scraped.source === "Amazon AE" ? "source-amazon" : t.scraped.source === "Sharaf DG" ? "source-sharaf" : t.scraped.source === "Carrefour UAE" ? "source-carrefour" : t.scraped.source === "Rattan Elect" ? "source-rattan" : "source-lulu"}`}>
                    {t.scraped.source}
                </span>
                <h4 className="font-bold text-sm line-clamp-2" title={t.scraped.title}>{t.scraped.title}</h4>
              </div>
            </div>

            <div className="flex justify-between items-end border-t pt-4">
                <div className="flex flex-col">
                    <span className="text-[10px] text-gray-400 font-bold">YOUR PRICE</span>
                    <span className="price-value our-price">{formatAED(t.ourPrice)}</span>
                </div>
                <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-400 font-bold">COMPETITOR</span>
                    <span className={`price-value rival-price ${t.isRivalCheaper ? 'text-purple-600' : ''}`}>{formatAED(t.scrapedPriceNum)}</span>
                </div>
            </div>

            <div className="mt-4 flex justify-between items-center">
                <span className={`text-xs font-bold ${t.priceDiffPct < 0 ? 'text-green-500' : 'text-purple-500'}`}>
                    {t.priceDiffPct < 0 ? 'CHEAPER BY' : 'EXPENSIVE BY'} {Math.abs(t.priceDiffPct)}%
                </span>
                <a href={t.scraped.url} target="_blank" className="text-[10px] font-bold text-blue-500 hover:underline">VISIT SITE →</a>
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-10 pt-10 border-t text-center text-gray-400 text-xs">
          <p>© 2025 PriceWatch UAE — Multi-Retailer Analytics Engine</p>
          <p className="mt-2">Tracking Amazon, Carrefour, Lulu, Sharaf DG and Rattan Elect</p>
      </footer>
    </div>
  );
}
