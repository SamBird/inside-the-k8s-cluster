import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inside the Kubernetes Cluster Dashboard",
  description: "Projector-friendly local dashboard for Kubernetes teaching demos"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
