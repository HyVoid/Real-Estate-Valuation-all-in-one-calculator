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
  title: 'Theseus Workshop | Capital Allocation & Real Estate Operations',
  description: 'Parametric multi-scenario decision engine & 120-month operations simulator for capital allocation and real estate operations by Theseus Workshop.',
  openGraph: {
    title: 'Theseus Workshop | Capital Allocation & Real Estate Operations',
    description: 'Parametric multi-scenario decision engine & 120-month operations simulator for capital allocation and real estate operations by Theseus Workshop.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Theseus Workshop | Capital Allocation & Real Estate Operations',
    description: 'Parametric multi-scenario decision engine & 120-month operations simulator for capital allocation and real estate operations by Theseus Workshop.',
  },
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

