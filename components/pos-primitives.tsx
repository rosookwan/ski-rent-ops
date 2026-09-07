"use client"

import type { ReactNode } from "react"
import { Minus, Plus } from "lucide-react"
import type { Density } from "@/lib/pos-data"

export function SectionCard({
  d,
  icon,
  title,
  desc,
  right,
  children,
}: {
  d: Density
  icon: ReactNode
  title: string
  desc?: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`bg-card border border-border ${d.card} ${d.cardPad} flex flex-col`}>
      <header className="flex items-center gap-3 mb-3.5">
        <span className={`${d.iconBox} shrink-0 grid place-items-center rounded-xl bg-soft text-soft-foreground`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={`${d.sectionTitle} font-bold leading-tight break-keep`}>{title}</h3>
          {desc ? <p className={`${d.sectionDesc} text-muted-foreground mt-0.5 break-keep`}>{desc}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function Field({
  d,
  label,
  children,
  full,
}: {
  d: Density
  label: string
  children: ReactNode
  full?: boolean
}) {
  return (
    <label className={`flex flex-col gap-1.5 min-w-0 ${full ? "col-span-full" : ""}`}>
      <span className={`${d.label} font-medium text-muted-foreground`}>{label}</span>
      {children}
    </label>
  )
}

export function TextInput({
  d,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  d: Density
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: "text" | "tel" | "numeric"
}) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full ${d.input} rounded-xl border border-input bg-card font-medium text-foreground outline-none placeholder:text-muted-foreground placeholder:font-normal focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25`}
    />
  )
}

export function SegmentedControl({
  d,
  options,
  value,
  onChange,
  wrap = true,
}: {
  d: Density
  options: string[]
  value: string
  onChange: (v: string) => void
  wrap?: boolean
}) {
  return (
    <div className={`flex ${wrap ? "flex-wrap" : ""} ${d.segRow}`}>
      {options.map((opt) => {
        const active = opt === value
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt)}
            className={`${d.seg} inline-flex items-center justify-center rounded-xl border font-semibold break-keep transition-colors ${
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}

export function Stepper({
  d,
  value,
  onChange,
  min = 0,
}: {
  d: Density
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  const btn = `${d.stepBtn} shrink-0 grid place-items-center rounded-xl border border-input bg-card text-foreground disabled:opacity-35 active:bg-muted transition-colors`
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        aria-label="수량 줄이기"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className={btn}
      >
        <Minus className="size-5" strokeWidth={2.2} />
      </button>
      <span
        className={`${d.stepVal} text-center font-bold tabular-nums ${value > 0 ? "text-foreground" : "text-muted-foreground"}`}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="수량 늘리기"
        onClick={() => onChange(value + 1)}
        className={`${btn} ${value > 0 ? "border-primary/40 bg-soft text-soft-foreground" : ""}`}
      >
        <Plus className="size-5" strokeWidth={2.2} />
      </button>
    </div>
  )
}
