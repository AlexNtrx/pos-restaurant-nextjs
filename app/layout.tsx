import type { Metadata } from "next";
import { Cormorant_Garamond, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
});

const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant-garamond",
});

export const metadata: Metadata = {
  title: "Ravintola POS",
  description: "Ravintolan kassajärjestelmä",
  // Renders the root layout interface.
};

// Renders the root layout interface.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fi"
      className={`${instrumentSans.variable} ${cormorantGaramond.variable}`}
    >
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
