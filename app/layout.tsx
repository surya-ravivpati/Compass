import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compass",
  description:
    "See how today's course choices shape the next four years.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
