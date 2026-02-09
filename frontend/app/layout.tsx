import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sharaf DG Deals | Live Product Scraper",
  description: "Live scraped home appliance deals from Sharaf DG UAE. Find the best prices on electronics and home appliances.",
  keywords: ["Sharaf DG", "UAE", "home appliances", "electronics", "deals", "prices"],
  openGraph: {
    title: "Sharaf DG Deals | Live Product Scraper",
    description: "Live scraped home appliance deals from Sharaf DG UAE",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
