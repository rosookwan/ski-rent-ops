"use client"

import { useMemo, useState } from "react"

export type Variant = "compact" | "wide" | "rich"

export interface Preset {
  id: Variant
  w: number
  h: number
  name: string
  size: string
  hint: string
}

export const PRESETS: Preset[] = [
  { id: "compact", w: 1024, h: 768, name: "15인치 일반형", size: "1024 × 768 · 4:3", hint: "컴팩트 · 세로 단일 열" },
  { id: "wide", w: 1366, h: 768, name: "15.6인치 와이드형", size: "1366 × 768", hint: "가로 2단 · 결제 사이드바" },
  { id: "rich", w: 1920, h: 1080, name: "21.5인치 Full HD", size: "1920 × 1080", hint: "대형 · 풍부한 정보 배치" },
]

/* ---- 카탈로그 (샘플) ---- */

export interface EquipItem {
  id: string
  group: string
  name: string
  price: number
  options: string[]
}

export const EQUIPMENT: EquipItem[] = [
  { id: "ski-std", group: "스키", name: "스키 세트 · 일반", price: 20000, options: ["성인", "청소년", "아동"] },
  { id: "ski-pro", group: "스키", name: "스키 세트 · 고급", price: 35000, options: ["성인", "청소년"] },
  { id: "board", group: "보드", name: "보드 세트", price: 25000, options: ["성인", "청소년", "아동"] },
  { id: "wear", group: "의류", name: "스키복 상·하의", price: 15000, options: ["S", "M", "L", "XL"] },
  { id: "helmet", group: "안전장비", name: "헬멧", price: 5000, options: ["성인", "아동"] },
  { id: "goggle", group: "안전장비", name: "고글", price: 5000, options: [] },
]

export interface TicketItem {
  id: string
  name: string
  price: number
}

export const TICKETS: TicketItem[] = [
  { id: "day", name: "주간권", price: 55000 },
  { id: "afternoon", name: "오후권", price: 45000 },
  { id: "night", name: "야간권", price: 40000 },
]

export const ROUTES = ["재방문", "네이버 예약", "지인 소개", "숙소 제휴", "기타"]
export const RETURN_SLOTS = ["오전타임 후", "오후타임 후", "야간타임 후", "직접 시간"]
export const PAY_METHODS = ["카드", "현금", "계좌이체"]
export const TICKET_GRADES = ["성인", "청소년", "경로·복지"]

/* ---- 상태 ---- */

export interface IntakeState {
  name: string
  phone: string
  adults: number
  children: number
  route: string
  startISO: string
  days: number
  pickup: string
  returnMethod: string
  returnSlot: string
  qty: Record<string, number>
  opt: Record<string, string>
  ticketQty: Record<string, number>
  ticketGrade: string
  discount: number
  prepaid: number
  payMethod: string
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

const DEFAULT_STATE: IntakeState = {
  name: "김도윤",
  phone: "010-1234-5678",
  adults: 2,
  children: 1,
  route: "네이버 예약",
  startISO: todayISO(),
  days: 2,
  pickup: "매장 수령",
  returnMethod: "차량 수거",
  returnSlot: "오후타임 후",
  qty: { "ski-std": 2, wear: 2, helmet: 1, goggle: 1 },
  opt: { "ski-std": "성인", wear: "L", helmet: "성인" },
  ticketQty: { afternoon: 3 },
  ticketGrade: "성인",
  discount: 10000,
  prepaid: 50000,
  payMethod: "카드",
}

export function useIntakeState() {
  const [state, setState] = useState<IntakeState>(DEFAULT_STATE)

  const patch = (p: Partial<IntakeState>) => setState((s) => ({ ...s, ...p }))
  const setQty = (id: string, n: number) =>
    setState((s) => ({ ...s, qty: { ...s.qty, [id]: Math.max(0, n) } }))
  const setOpt = (id: string, v: string) =>
    setState((s) => ({ ...s, opt: { ...s.opt, [id]: v } }))
  const setTicketQty = (id: string, n: number) =>
    setState((s) => ({ ...s, ticketQty: { ...s.ticketQty, [id]: Math.max(0, n) } }))
  const reset = () => setState(DEFAULT_STATE)

  const totals = useMemo(() => {
    const lines: { label: string; detail: string; amount: number }[] = []
    for (const e of EQUIPMENT) {
      const n = state.qty[e.id] || 0
      if (n <= 0) continue
      const amount = e.price * n * state.days
      const optLabel = state.opt[e.id] ? ` · ${state.opt[e.id]}` : ""
      lines.push({
        label: `${e.name}${optLabel}`,
        detail: `${money(e.price)} × ${n}개 × ${state.days}일`,
        amount,
      })
    }
    for (const t of TICKETS) {
      const n = state.ticketQty[t.id] || 0
      if (n <= 0) continue
      lines.push({
        label: `${t.name} · ${state.ticketGrade}`,
        detail: `${money(t.price)} × ${n}매`,
        amount: t.price * n,
      })
    }
    const subtotal = lines.reduce((a, l) => a + l.amount, 0)
    const total = Math.max(0, subtotal - state.discount)
    const balance = Math.max(0, total - state.prepaid)
    const itemCount = Object.values(state.qty).reduce((a, n) => a + n, 0)
    const ticketCount = Object.values(state.ticketQty).reduce((a, n) => a + n, 0)
    return { lines, subtotal, total, balance, itemCount, ticketCount }
  }, [state])

  return { state, patch, setQty, setOpt, setTicketQty, reset, totals }
}

export type IntakeApi = ReturnType<typeof useIntakeState>

/* ---- 유틸 ---- */

export function money(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n) + "원"
}

const WEEK = ["일", "월", "화", "수", "목", "금", "토"]

export function fmtDate(iso: string, offsetDays = 0) {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + offsetDays)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`
}

/* ---- 밀도(해상도)별 스타일 토큰 ---- */

export interface Density {
  layout: "single" | "split"
  root: string
  title: string
  subtitle: string
  sectionTitle: string
  sectionDesc: string
  card: string
  cardPad: string
  bodyGap: string
  fieldGrid: string
  equipCols: string
  label: string
  input: string
  stepBtn: string
  stepVal: string
  seg: string
  segRow: string
  chip: string
  sidebar: string
  lineLabel: string
  lineAmt: string
  totalAmt: string
  cta: string
  ctaSub: string
  iconBox: string
}

export const DENSITY: Record<Variant, Density> = {
  compact: {
    layout: "single",
    root: "text-[15px]",
    title: "text-[21px]",
    subtitle: "text-[13px]",
    sectionTitle: "text-[16px]",
    sectionDesc: "text-[12px]",
    card: "rounded-2xl",
    cardPad: "p-3.5",
    bodyGap: "gap-3",
    fieldGrid: "grid-cols-2 gap-2.5",
    equipCols: "grid-cols-1 gap-2.5",
    label: "text-[12px]",
    input: "h-11 text-[15px] px-3",
    stepBtn: "h-11 w-11",
    stepVal: "text-[18px] w-9",
    seg: "h-11 px-3 text-[14px]",
    segRow: "gap-1.5",
    chip: "text-[11px] px-2 py-0.5",
    sidebar: "",
    lineLabel: "text-[13px]",
    lineAmt: "text-[14px]",
    totalAmt: "text-[24px]",
    cta: "h-14 text-[17px]",
    ctaSub: "h-14 text-[15px]",
    iconBox: "h-8 w-8",
  },
  wide: {
    layout: "split",
    root: "text-[16px]",
    title: "text-[26px]",
    subtitle: "text-[14px]",
    sectionTitle: "text-[18px]",
    sectionDesc: "text-[13px]",
    card: "rounded-2xl",
    cardPad: "p-4",
    bodyGap: "gap-3.5",
    fieldGrid: "grid-cols-2 gap-3",
    equipCols: "grid-cols-1 gap-3",
    label: "text-[13px]",
    input: "h-12 text-[16px] px-3.5",
    stepBtn: "h-12 w-12",
    stepVal: "text-[20px] w-10",
    seg: "h-12 px-4 text-[15px]",
    segRow: "gap-2",
    chip: "text-[12px] px-2.5 py-0.5",
    sidebar: "w-[368px]",
    lineLabel: "text-[14px]",
    lineAmt: "text-[15px]",
    totalAmt: "text-[28px]",
    cta: "h-15 text-[19px]",
    ctaSub: "h-15 text-[16px]",
    iconBox: "h-9 w-9",
  },
  rich: {
    layout: "split",
    root: "text-[18px]",
    title: "text-[32px]",
    subtitle: "text-[16px]",
    sectionTitle: "text-[21px]",
    sectionDesc: "text-[15px]",
    card: "rounded-3xl",
    cardPad: "p-6",
    bodyGap: "gap-5",
    fieldGrid: "grid-cols-3 gap-4",
    equipCols: "grid-cols-2 gap-4",
    label: "text-[14px]",
    input: "h-14 text-[18px] px-4",
    stepBtn: "h-14 w-14",
    stepVal: "text-[24px] w-12",
    seg: "h-14 px-5 text-[17px]",
    segRow: "gap-2.5",
    chip: "text-[13px] px-3 py-1",
    sidebar: "w-[440px]",
    lineLabel: "text-[16px]",
    lineAmt: "text-[17px]",
    totalAmt: "text-[38px]",
    cta: "h-18 text-[23px]",
    ctaSub: "h-18 text-[19px]",
    iconBox: "h-11 w-11",
  },
}
