"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface Product {
  id: number;
  title: string;
  price: string;
  image: string;
  url: string;
}

interface ApiResponse {
  success: boolean;
  count: number;
  cached: boolean;
  products: Product[];
  error?: string;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);

  const API_URL = "http://localhost:3001";

  const fetchProducts = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const endpoint = forceRefresh ? "/api/products/refresh" : "/api/products";
      const response = await fetch(`${API_URL}${endpoint}`);
      const data: ApiResponse = await response.json();

      if (data.success) {
        setProducts(data.products);
        setIsCached(data.cached || false);
        setLastUpdated(new Date());
      } else {
        setError(data.error || "Failed to fetch products");
      }
    } catch (err) {
      setError("Unable to connect to server. Make sure the backend is running on port 3001.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const formatPrice = (price: string) => {
    // Clean up the price string
    const cleaned = price.replace(/[^\d.,AED\s]/g, "").trim();
    if (cleaned.includes("AED")) {
      return cleaned;
    }
    return `AED ${cleaned}`;
  };

  if (loading) {
    return (
      <>
        <div className="gradient-bg" />
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
          <div className="spinner" />
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Loading Products</h2>
            <p className="text-[var(--text-muted)]">
              Scraping latest deals from Sharaf DG...
            </p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="gradient-bg" />
        <div className="min-h-screen flex items-center justify-center p-8">
          <div className="error-container glass-card max-w-md">
            <div className="error-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Connection Error</h2>
            <p className="text-[var(--text-muted)]">{error}</p>
            <button
              onClick={() => fetchProducts()}
              className="refresh-button mt-4"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              Try Again
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="gradient-bg" />
      <div className="min-h-screen p-6 md:p-10">
        {/* Header */}
        <header className="max-w-7xl mx-auto mb-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">
                <span className="header-gradient">Sharaf DG</span>
                <span className="text-white"> Deals</span>
              </h1>
              <p className="text-[var(--text-muted)] text-lg">
                Live scraped home appliance deals from UAE
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="stats-bar">
                <div className="stat-item">
                  <span className="stat-label">Products</span>
                  <span className="stat-value">{products.length}</span>
                </div>
                {lastUpdated && (
                  <div className="stat-item">
                    <span className="stat-label">Updated</span>
                    <span className="stat-value text-base">
                      {lastUpdated.toLocaleTimeString()}
                    </span>
                  </div>
                )}
                {isCached && (
                  <div className="stat-item">
                    <span className="stat-label">Status</span>
                    <span className="text-[var(--gold)] font-semibold flex items-center gap-1">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      Cached
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={() => fetchProducts(true)}
                disabled={refreshing}
                className="refresh-button"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className={refreshing ? "animate-spin" : ""}
                >
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                {refreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
          </div>
        </header>

        {/* Products Grid */}
        <main className="max-w-7xl mx-auto">
          {products.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-[var(--text-muted)] text-xl">No products found</p>
            </div>
          ) : (
            <div className="products-grid">
              {products.map((product, index) => (
                <article
                  key={product.id || index}
                  className={`glass-card fade-in-up opacity-0`}
                  style={{ animationDelay: `${Math.min(index * 0.05, 0.5)}s` }}
                >
                  <div className="product-image-container">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.title}
                        className="product-image"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <svg
                          width="60"
                          height="60"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1"
                          className="text-[var(--text-muted)] opacity-30"
                        >
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                      </div>
                    )}
                  </div>

                  <div className="p-5 flex flex-col gap-4">
                    <h3 className="text-lg font-semibold text-white leading-snug line-clamp-2 min-h-[3.2rem]">
                      {product.title}
                    </h3>

                    <div className="flex items-center justify-between gap-3">
                      <span className="price-badge">
                        {formatPrice(product.price)}
                      </span>
                    </div>

                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="view-button w-full"
                    >
                      View Deal
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>

        {/* Footer */}
        <footer className="max-w-7xl mx-auto mt-16 pt-8 border-t border-[var(--card-border)]">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-[var(--text-muted)] text-sm">
            <p>
              Data scraped from{" "}
              <a
                href="https://uae.sharafdg.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-primary)] hover:underline"
              >
                Sharaf DG UAE
              </a>
            </p>
            <p>Prices and availability subject to change</p>
          </div>
        </footer>
      </div>
    </>
  );
}
