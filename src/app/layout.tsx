import "./globals.css";
import React from "react";

export const metadata = {
  title: "HSR Battle Analyzer AI",
  description: "Battle analysis UI",
  icons: {
    icon: '/icon.png', // または '/icon.png', '/icon.svg'
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}