import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const restartMedium = localFont({
  src: "../fonts/restart-soft-medium.woff2",
  weight: "500",
  style: "normal",
  variable: "--font-restart-medium",
  display: "block",
});

const restartRegular = localFont({
  src: "../fonts/restart-soft-regular.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-restart-regular",
  display: "block",
});

const title = "Blade";

const protoMono = localFont({
  src: "../fonts/proto-mono-semibold.woff2",
  weight: "600",
  style: "normal",
  variable: "--font-proto-mono",
  display: "block",
});

const geistPixel = localFont({
  src: "../fonts/geist-pixel-line.woff2",
  weight: "400",
  style: "normal",
  variable: "--font-geist-pixel",
  display: "block",
});

const description =
  "Blade is data loss prevention for hospitals. It inspects outgoing Gmail and any web text box, including ChatGPT, and stops patient identifiers before they leave the browser.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: title,
  icons: {
    icon: [
      { url: "/img/favicon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/img/favicon-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
  },
  openGraph: { type: "website", siteName: title, title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${restartMedium.variable} ${restartRegular.variable} ${protoMono.variable} ${geistPixel.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
