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
import "./demo.css";

// ─── Types ─────────────────────────────────────────────
interface ScrapedProduct {
  id: number;
  title: string;
  price: string;
  image: string;
  url: string;
}

interface TrackedProduct {
  scraped: ScrapedProduct;
  scrapedPriceNum: number;
  ourPrice: number;
  previousScrapedPrice: number;
  priceDiff: number;
  priceDiffPct: number;
  isRivalCheaper: boolean;
  justDropped: boolean;
}

interface PriceAlert {
  id: string;
  productName: string;
  source: string;
  oldPrice: number;
  newPrice: number;
  dropPercentage: number;
  timestamp: Date;
  read: boolean;
  type: "price_drop" | "price_undercut" | "new_low";
}

// ─── Helper: Parse AED price string to number ─────────
function parsePriceToNumber(priceStr: string): number {
  const cleaned = priceStr.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function formatAED(num: number): string {
  return `AED ${num.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Main Demo Dashboard ───────────────────────────────
export default function DemoDashboard() {
  const [scrapedProducts, setScrapedProducts] = useState<ScrapedProduct[]>([]);
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [selectedView, setSelectedView] = useState<"all" | "cheaper" | "expensive">("all");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [liveStatus, setLiveStatus] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState("");

  const API_URL = "http://localhost:3001";

  const unreadCount = alerts.filter((a) => !a.read).length;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Build tracked products from scraped data
  const buildTrackedProducts = useCallback(
    (products: ScrapedProduct[], existingTracked?: TrackedProduct[]): TrackedProduct[] => {
      return products.map((scraped) => {
        const scrapedPriceNum = parsePriceToNumber(scraped.price);
        // Check if we had a previous tracked entry for this product
        const existing = existingTracked?.find(
          (t) => t.scraped.title === scraped.title
        );
        // Generate a simulated "our price" — slightly above or below the scraped price
        // In production, this would come from your actual product catalog
        const ourPrice = existing
          ? existing.ourPrice
          : Math.round(scrapedPriceNum * (0.9 + Math.random() * 0.2) * 100) / 100;

        const previousScrapedPrice = existing
          ? existing.scrapedPriceNum
          : scrapedPriceNum;

        const priceDiff = ourPrice - scrapedPriceNum;
        const priceDiffPct =
          ourPrice > 0
            ? Math.round((priceDiff / ourPrice) * 10000) / 100
            : 0;

        return {
          scraped,
          scrapedPriceNum,
          ourPrice,
          previousScrapedPrice,
          priceDiff,
          priceDiffPct,
          isRivalCheaper: scrapedPriceNum < ourPrice,
          justDropped: existing
            ? scrapedPriceNum < existing.scrapedPriceNum
            : false,
        };
      });
    },
    []
  );

  // Fetch products from API
  const fetchProducts = useCallback(
    async (forceRefresh = false) => {
      try {
        if (forceRefresh) setIsRefreshing(true);
        else setLoading(true);
        setError(null);

        const endpoint = forceRefresh
          ? "/api/products/refresh"
          : "/api/products";
        const response = await fetch(`${API_URL}${endpoint}`);
        const data = await response.json();

        if (data.success && data.products?.length > 0) {
          setScrapedProducts(data.products);
          const tracked = buildTrackedProducts(
            data.products,
            trackedProducts.length > 0 ? trackedProducts : undefined
          );
          setTrackedProducts(tracked);
          setLastScanTime(new Date());

          if (forceRefresh) {
            // Check for price changes and generate alerts
            const newAlerts: PriceAlert[] = [];
            tracked.forEach((t) => {
              if (t.justDropped) {
                const dropPct =
                  Math.round(
                    ((t.previousScrapedPrice - t.scrapedPriceNum) /
                      t.previousScrapedPrice) *
                      10000
                  ) / 100;
                newAlerts.push({
                  id: `alert-${Date.now()}-${t.scraped.id}`,
                  productName: t.scraped.title,
                  source: "Sharaf DG",
                  oldPrice: t.previousScrapedPrice,
                  newPrice: t.scrapedPriceNum,
                  dropPercentage: dropPct,
                  timestamp: new Date(),
                  read: false,
                  type:
                    t.scrapedPriceNum < t.ourPrice
                      ? "price_undercut"
                      : "price_drop",
                });
              }
            });
            if (newAlerts.length > 0) {
              setAlerts((prev) => [...newAlerts, ...prev]);
              showToast(
                `🔄 Refreshed! ${newAlerts.length} price change(s) detected.`
              );
            } else {
              showToast(`✅ Refreshed ${tracked.length} products. No new price changes.`);
            }
          }
        } else {
          setError(data.error || "No products returned from scraper.");
        }
      } catch {
        setError(
          "Unable to connect to the scraper server. Make sure the backend is running on port 3001."
        );
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [API_URL, buildTrackedProducts, showToast, trackedProducts]
  );

  // Initial fetch
  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pulse the live indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setLiveStatus((prev) => !prev);
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const markAllRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  // Update "our price" for a product
  const updateOurPrice = (productId: number, newPrice: number) => {
    setTrackedProducts((prev) =>
      prev.map((t) => {
        if (t.scraped.id === productId) {
          const priceDiff = newPrice - t.scrapedPriceNum;
          const priceDiffPct =
            newPrice > 0
              ? Math.round((priceDiff / newPrice) * 10000) / 100
              : 0;
          return {
            ...t,
            ourPrice: newPrice,
            priceDiff,
            priceDiffPct,
            isRivalCheaper: t.scrapedPriceNum < newPrice,
          };
        }
        return t;
      })
    );
    setEditingPriceId(null);
    setEditPriceValue("");
  };

  // Filtered products
  const filteredProducts = trackedProducts.filter((t) => {
    const matchesView =
      selectedView === "all"
        ? true
        : selectedView === "cheaper"
          ? t.isRivalCheaper
          : !t.isRivalCheaper;
    const matchesSearch =
      searchQuery === "" ||
      t.scraped.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesView && matchesSearch;
  });

  // Summary stats
  const totalProducts = trackedProducts.length;
  const rivalCheaperCount = trackedProducts.filter(
    (t) => t.isRivalCheaper
  ).length;
  const ourCheaperCount = totalProducts - rivalCheaperCount;
  const avgPriceDiff =
    totalProducts > 0
      ? trackedProducts.reduce((sum, t) => sum + t.priceDiffPct, 0) /
        totalProducts
      : 0;

  const formatTimeAgo = (date: Date) => {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // ─── Loading State ─────────────────────────────────
  if (loading) {
    return (
      <>
        <div className="demo-bg" />
        <div className="demo-loading-screen">
          <div className="demo-loading-spinner" />
          <h2 className="demo-loading-title">Connecting to Scraper</h2>
          <p className="demo-loading-subtitle">
            Fetching live products from Sharaf DG...
          </p>
        </div>
      </>
    );
  }

  // ─── Error State ───────────────────────────────────
  if (error) {
    return (
      <>
        <div className="demo-bg" />
        <div className="demo-loading-screen">
          <div className="demo-error-icon">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="demo-loading-title">Connection Error</h2>
          <p className="demo-loading-subtitle">{error}</p>
          <button className="simulate-btn" onClick={() => fetchProducts()}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
            </svg>
            Try Again
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="demo-bg" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification">
          <div className="toast-content">{toastMessage}</div>
        </div>
      )}

      <div className="min-h-screen p-4 md:p-8">
        {/* ─── Header ─────────────────────────────────── */}
        <header className="demo-header">
          <div className="demo-header-left">
            <div className="demo-badge">LIVE</div>
            <div>
              <h1 className="demo-title">
                <span className="header-gradient">PriceWatch</span>
                <span style={{ color: "#fff" }}> Dashboard</span>
              </h1>
              <p className="demo-subtitle">
                Real-time competitor price monitoring — Sharaf DG UAE
              </p>
            </div>
          </div>

          <div className="demo-header-right">
            <div className="live-indicator">
              <span
                className="live-dot"
                style={{ opacity: liveStatus ? 1 : 0.3 }}
              />
              <span>SCRAPER ACTIVE</span>
            </div>

            <button
              className="simulate-btn"
              onClick={() => fetchProducts(true)}
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <>
                  <span className="btn-spinner" />
                  Scraping...
                </>
              ) : (
                <>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M23 4v6h-6" />
                    <path d="M1 20v-6h6" />
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                  </svg>
                  Re-Scrape Prices
                </>
              )}
            </button>

            <button
              className="notif-btn"
              onClick={() => setShowNotifPanel(!showNotifPanel)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="notif-badge">{unreadCount}</span>
              )}
            </button>
          </div>
        </header>

        {/* ─── Stats Cards ────────────────────────────── */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-card-icon stat-icon-blue">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
              </svg>
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Products Tracked</span>
              <span className="stat-card-value">{totalProducts}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon stat-icon-red">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Rival Cheaper On</span>
              <span className="stat-card-value">
                {rivalCheaperCount} / {totalProducts}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon stat-icon-green">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">You're Cheaper On</span>
              <span className="stat-card-value">
                {ourCheaperCount} / {totalProducts}
              </span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-icon stat-icon-purple">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
            <div className="stat-card-info">
              <span className="stat-card-label">Avg Price Gap</span>
              <span className="stat-card-value">
                {avgPriceDiff > 0 ? "+" : ""}
                {avgPriceDiff.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* ─── Charts Section ──────────────────────────── */}
        {trackedProducts.length > 0 && (
          <div className="charts-section">
            {/* Pie Chart: Competitive Breakdown */}
            <div className="chart-card">
              <div className="chart-card-header">
                <h3 className="chart-title">Competitive Overview</h3>
                <p className="chart-subtitle">Who has cheaper prices?</p>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: "You're Cheaper", value: ourCheaperCount },
                        { name: "Competitor Cheaper", value: rivalCheaperCount },
                      ]}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                    <Cell fill="#16a34a" />
                    <Cell fill="#7c3aed" />
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        color: "#1f2937",
                        fontSize: "0.85rem",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      iconSize={10}
                      formatter={(value: string) => (
                        <span style={{ color: "#64748b", fontSize: "0.82rem", fontWeight: 600 }}>
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-center-label">
                  <span className="pie-center-value">{totalProducts}</span>
                  <span className="pie-center-text">Products</span>
                </div>
              </div>
            </div>

            {/* Bar Chart: Price Comparison (Top 8 Products) */}
            <div className="chart-card chart-card-wide">
              <div className="chart-card-header">
                <h3 className="chart-title">Price Comparison</h3>
                <p className="chart-subtitle">Your price vs competitor (top products)</p>
              </div>
              <div className="chart-body">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={trackedProducts
                      .filter((t) => t.scrapedPriceNum > 0 && t.ourPrice > 0)
                      .slice(0, 8)
                      .map((t) => ({
                        name:
                          t.scraped.title.length > 18
                            ? t.scraped.title.substring(0, 18) + "..."
                            : t.scraped.title,
                        "Your Price": Math.round(t.ourPrice),
                        "Competitor": Math.round(t.scrapedPriceNum),
                      }))}
                    margin={{ top: 10, right: 10, left: 10, bottom: 40 }}
                    barGap={2}
                    barCategoryGap="18%"
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#f1f5f9"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={{ stroke: "#e2e8f0" }}
                      tickLine={false}
                      angle={-25}
                      textAnchor="end"
                      interval={0}
                      height={50}
                    />
                    <YAxis
                      tick={{ fill: "#94a3b8", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#ffffff",
                        border: "1px solid #e5e7eb",
                        borderRadius: "12px",
                        color: "#1f2937",
                        fontSize: "0.85rem",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                      }}
                      formatter={(value: number | undefined) => value != null ? [`AED ${value.toLocaleString()}`, undefined] : ["", undefined]}
                    />
                    <Bar
                      dataKey="Your Price"
                      fill="#16a34a"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      dataKey="Competitor"
                      fill="#7c3aed"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={32}
                    />
                    <Legend
                      verticalAlign="top"
                      align="right"
                      iconType="circle"
                      iconSize={10}
                      wrapperStyle={{ paddingBottom: "8px" }}
                      formatter={(value: string) => (
                        <span style={{ color: "#64748b", fontSize: "0.82rem", fontWeight: 600 }}>
                          {value}
                        </span>
                      )}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ─── Filter Bar ─────────────────────────────── */}
        <div className="category-filter">
          <button
            className={`category-pill ${selectedView === "all" ? "active" : ""}`}
            onClick={() => setSelectedView("all")}
          >
            All ({totalProducts})
          </button>
          <button
            className={`category-pill ${selectedView === "cheaper" ? "active" : ""}`}
            onClick={() => setSelectedView("cheaper")}
          >
            ⚠️ Rival Cheaper ({rivalCheaperCount})
          </button>
          <button
            className={`category-pill ${selectedView === "expensive" ? "active" : ""}`}
            onClick={() => setSelectedView("expensive")}
          >
            ✅ You're Cheaper ({ourCheaperCount})
          </button>

          <div className="search-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {lastScanTime && (
            <div className="last-scan">
              Last scan: {lastScanTime.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* ─── Product Comparison Cards ────────────────── */}
        <div className="comparison-grid">
          {filteredProducts.length === 0 ? (
            <div className="empty-state">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>No products match your filter</p>
            </div>
          ) : (
            filteredProducts.map((tracked, index) => (
              <div
                key={tracked.scraped.id}
                className={`comparison-card fade-in-up ${tracked.isRivalCheaper ? "rival-winning" : "our-winning"}`}
                style={{
                  animationDelay: `${Math.min(index * 0.06, 0.5)}s`,
                  opacity: 0,
                }}
              >
                {/* Alert badge if rival just dropped */}
                {tracked.justDropped && (
                  <div className="drop-alert-badge">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                      <polyline points="17 18 23 18 23 12" />
                    </svg>
                    PRICE DROP
                  </div>
                )}

                {/* Product Info */}
                <div className="product-card-top">
                  <div className="product-card-info">
                    <div className="product-source-label">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 2L2 7l10 5 10-5-10-5z" />
                        <path d="M2 17l10 5 10-5" />
                        <path d="M2 12l10 5 10-5" />
                      </svg>
                      Sharaf DG
                    </div>
                    <h3 className="product-card-title">
                      {tracked.scraped.title}
                    </h3>
                    <a
                      href={tracked.scraped.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="product-link"
                    >
                      View on Sharaf DG →
                    </a>
                  </div>
                </div>

                {/* Visual Price Bar */}
                {tracked.scrapedPriceNum > 0 && tracked.ourPrice > 0 && (
                  <div className="visual-price-bar-section">
                    <div className="visual-bar-row">
                      <span className="visual-bar-label">You</span>
                      <div className="visual-bar-track">
                        <div
                          className="visual-bar-fill our-bar-fill"
                          style={{
                            width: `${Math.min(
                              (tracked.ourPrice /
                                Math.max(tracked.ourPrice, tracked.scrapedPriceNum)) *
                                100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="visual-bar-value">
                        {Math.round(tracked.ourPrice).toLocaleString()}
                      </span>
                    </div>
                    <div className="visual-bar-row">
                      <span className="visual-bar-label">Rival</span>
                      <div className="visual-bar-track">
                        <div
                          className="visual-bar-fill rival-bar-fill"
                          style={{
                            width: `${Math.min(
                              (tracked.scrapedPriceNum /
                                Math.max(tracked.ourPrice, tracked.scrapedPriceNum)) *
                                100,
                              100
                            )}%`,
                          }}
                        />
                      </div>
                      <span className="visual-bar-value">
                        {Math.round(tracked.scrapedPriceNum).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {/* Price Comparison */}
                <div className="price-comparison-section">
                  <div className="price-column competitor-column">
                    <span className="price-label">
                      <span className="brand-dot rival-dot" />
                      Competitor Price
                    </span>
                    <span
                      className={`price-value rival-price ${tracked.justDropped ? "price-dropped" : ""}`}
                    >
                      {tracked.scrapedPriceNum > 0
                        ? formatAED(tracked.scrapedPriceNum)
                        : tracked.scraped.price}
                      {tracked.justDropped && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="drop-arrow"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <polyline points="19 12 12 19 5 12" />
                        </svg>
                      )}
                    </span>
                    {tracked.justDropped && (
                      <span className="previous-price strikethrough">
                        was {formatAED(tracked.previousScrapedPrice)}
                      </span>
                    )}
                  </div>

                  <div className="vs-divider">
                    <span className="vs-text">VS</span>
                    <div
                      className={`price-diff-badge ${tracked.isRivalCheaper ? "diff-negative" : "diff-positive"}`}
                    >
                      {tracked.priceDiff > 0 ? "+" : ""}
                      {Math.abs(tracked.priceDiffPct).toFixed(1)}%
                    </div>
                  </div>

                  <div className="price-column our-column">
                    <span className="price-label">
                      <span className="brand-dot our-dot" />
                      Your Price
                    </span>
                    {editingPriceId === tracked.scraped.id ? (
                      <div className="price-edit-row">
                        <input
                          type="number"
                          className="price-edit-input"
                          value={editPriceValue}
                          onChange={(e) => setEditPriceValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const val = parseFloat(editPriceValue);
                              if (!isNaN(val) && val > 0) {
                                updateOurPrice(tracked.scraped.id, val);
                              }
                            }
                            if (e.key === "Escape") {
                              setEditingPriceId(null);
                            }
                          }}
                          autoFocus
                        />
                        <button
                          className="price-edit-save"
                          onClick={() => {
                            const val = parseFloat(editPriceValue);
                            if (!isNaN(val) && val > 0) {
                              updateOurPrice(tracked.scraped.id, val);
                            }
                          }}
                        >
                          ✓
                        </button>
                      </div>
                    ) : (
                      <span
                        className="price-value our-price editable-price"
                        onClick={() => {
                          setEditingPriceId(tracked.scraped.id);
                          setEditPriceValue(tracked.ourPrice.toFixed(2));
                        }}
                        title="Click to edit your price"
                      >
                        {formatAED(tracked.ourPrice)}
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="edit-icon"
                        >
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Bar */}
                <div className="comparison-footer">
                  {tracked.isRivalCheaper ? (
                    <span className="status-tag warning-tag">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      Competitor is{" "}
                      {Math.abs(tracked.priceDiffPct).toFixed(1)}% cheaper
                    </span>
                  ) : (
                    <span className="status-tag safe-tag">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                      </svg>
                      You are {Math.abs(tracked.priceDiffPct).toFixed(1)}%
                      cheaper
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ─── Notification Panel (Slide-over) ────────── */}
        {showNotifPanel && (
          <div
            className="notif-overlay"
            onClick={() => setShowNotifPanel(false)}
          >
            <div
              className="notif-panel"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="notif-panel-header">
                <h2>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                  Price Alerts
                </h2>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="mark-read-btn" onClick={markAllRead}>
                    Mark all read
                  </button>
                  <button
                    className="close-panel-btn"
                    onClick={() => setShowNotifPanel(false)}
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="notif-list">
                {alerts.length === 0 ? (
                  <div className="notif-empty">
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 01-3.46 0" />
                    </svg>
                    <p>No alerts yet</p>
                    <span>
                      Price change alerts will appear here when you re-scrape.
                    </span>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`notif-item ${!alert.read ? "unread" : ""}`}
                      onClick={() =>
                        setAlerts((prev) =>
                          prev.map((a) =>
                            a.id === alert.id ? { ...a, read: true } : a
                          )
                        )
                      }
                    >
                      <div className="notif-icon-wrap">
                        {alert.type === "price_drop" && (
                          <div className="notif-icon notif-icon-drop">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                              <polyline points="17 18 23 18 23 12" />
                            </svg>
                          </div>
                        )}
                        {alert.type === "price_undercut" && (
                          <div className="notif-icon notif-icon-undercut">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          </div>
                        )}
                        {alert.type === "new_low" && (
                          <div className="notif-icon notif-icon-low">
                            <svg
                              width="18"
                              height="18"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="notif-body">
                        <p className="notif-title">{alert.productName}</p>
                        <p className="notif-detail">
                          {alert.source} dropped price from{" "}
                          <strong>{formatAED(alert.oldPrice)}</strong> →{" "}
                          <strong>{formatAED(alert.newPrice)}</strong>
                        </p>
                        <div className="notif-meta">
                          <span className="notif-pct">
                            ↓ {alert.dropPercentage.toFixed(1)}%
                          </span>
                          <span className="notif-time">
                            {formatTimeAgo(alert.timestamp)}
                          </span>
                        </div>
                      </div>
                      {!alert.read && <span className="unread-dot" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Footer ─────────────────────────────────── */}
        <footer className="demo-footer">
          <p>
            <strong>Live Scraper</strong> — Products scraped in real-time from{" "}
            <a
              href="https://uae.sharafdg.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "#818cf8", textDecoration: "underline" }}
            >
              Sharaf DG UAE
            </a>
          </p>
          <p>
            Click on &quot;Your Price&quot; to edit and compare against competitor
            pricing. Re-scrape to detect price changes.
          </p>
        </footer>
      </div>
    </>
  );
}
