import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "LogiQ Duka — Duka lako kwenye simu",
  description:
    "Sell, track stock, manage deni, take M-Pesa, stay KRA-compliant — from KES 250 a month, even without internet.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="sw">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#111827" }}>{children}</body>
    </html>
  );
}
