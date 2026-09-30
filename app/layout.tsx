import type { ReactNode } from "react";
import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "CapCut Automation",
  description: "영상 전사에서 쇼츠 후보를 분석하고 CapCut 프로젝트를 만드는 로컬 도구",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="dark">
      <body
        className="bg-background text-foreground antialiased"
      >
        {children}
      </body>
    </html>
  );
}
