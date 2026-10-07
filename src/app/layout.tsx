import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The serif carries everything a person wrote or was told.
 *
 * Headings, the memory itself, the line on a gift's door. The sans is for
 * labels and instructions - the parts that are the product talking rather
 * than a person.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Lantern — build someone the place they remember",
  description:
    "Describe a room from a memory. Lantern builds it as a world someone can step inside, and gives you a link to send to the person it was about.",
  openGraph: {
    title: "Lantern",
    description: "Build someone the place they remember.",
    type: "website",
  },
};

/** A gift is opened on a phone, in a message, usually at night. */
export const viewport: Viewport = {
  themeColor: "#05060a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
