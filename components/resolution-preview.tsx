"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Monitor, Maximize2 } from "lucide-react"
import { PRESETS, useIntakeState, type Variant } from "@/lib/pos-data"
import { PosIntake } from "@/components/pos-intake"

export function ResolutionPreview() {
  const [variant, setVariant] = useState<Variant>("wide")
  const preset = PRESETS.find((p) => p.id === variant)!
  const api = useIntakeState()

  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.55)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const padX = 56
      const padY = 56
      const availW = el.clientWidth - padX
      const availH = el.clientHeight - padY
      const s = Math.min(availW / preset.w, availH / preset.h)
      setScale(Math.max(0.25, Math.min(s, 1.35)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [preset.w, preset.h])

  return (
    <main className="flex h-dvh flex-col bg-background">
      {/* 상단 컨트롤 바 */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Monitor className="size-5" />
            </span>
            <div>
              <h1 className="text-[18px] font-extrabold leading-tight tracking-tight">대여 접수 · 포스기 UI 시안</h1>
              <p className="text-[13px] text-muted-foreground">해상도를 선택해 시안을 즉시 전환하세요</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-1.5 text-[13px] font-medium text-muted-foreground tabular-nums">
            <Maximize2 className="size-4" />
            {preset.w} × {preset.h}
            <span className="text-border">|</span>
            {Math.round(scale * 100)}%
          </div>
        </div>

        {/* 해상도 탭 */}
        <div className="flex flex-wrap gap-2 px-5 pb-3.5">
          {PRESETS.map((p, i) => {
            const active = p.id === variant
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => setVariant(p.id)}
                className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-colors ${
                  active
                    ? "border-primary bg-soft"
                    : "border-border bg-card hover:bg-muted"
                }`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg text-[13px] font-bold tabular-nums ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className={`block text-[14px] font-bold leading-tight ${active ? "text-soft-foreground" : "text-foreground"}`}>
                    {p.name}
                  </span>
                  <span className="block text-[12px] text-muted-foreground tabular-nums break-keep">
                    {p.size} · {p.hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </header>

      {/* 디바이스 스테이지 */}
      <div
        ref={stageRef}
        className="pos-scroll relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-7"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        <div
          className="shrink-0 rounded-[22px] bg-card shadow-[0_30px_80px_-24px_rgba(0,0,0,0.4)] ring-1 ring-black/10"
          style={{ width: preset.w * scale, height: preset.h * scale }}
        >
          <div
            className="origin-top-left overflow-hidden rounded-[22px]"
            style={{ width: preset.w, height: preset.h, transform: `scale(${scale})` }}
          >
            <PosIntake variant={variant} api={api} />
          </div>
        </div>
      </div>
    </main>
  )
}
