import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "대여 접수 · 포스기 UI 시안",
  description:
    "스키 렌탈 대여 접수 화면을 포스기(POS) 해상도별로 최적화한 UI 개선 시안 - 1024×768, 1366×768, 1920×1080",
}

export const viewport: Viewport = {
  themeColor: "#fe4e10",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="bg-background">
      <body className="antialiased">{children}</body>
    </html>
  )
}
