import type {Metadata} from 'next';
import { EB_Garamond, Inter } from 'next/font/google';
import './globals.css'; // Global styles

const ebGaramond = EB_Garamond({
  subsets: ['latin'],
  variable: '--font-heading',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Real Estate Operations Financial Model',
  description: 'High-Precision Parametric Decision Engine & Financial Analyzer for Real Estate Operational Scenarios',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${ebGaramond.variable} ${inter.variable}`}>
      <body suppressHydrationWarning className="bg-[#F5F5F2] text-[#1A1A2E] antialiased">
        {children}
      </body>
    </html>
  );
}

