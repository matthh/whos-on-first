import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Who's On First — Game Day Roster",
  description: "Baseball defensive position scheduler for youth leagues",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
