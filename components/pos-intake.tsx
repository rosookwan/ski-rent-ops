"use client"

import type { ReactNode } from "react"
import {
  ChevronLeft,
  RotateCcw,
  UserRound,
  CalendarDays,
  Snowflake,
  TicketCheck,
  ReceiptText,
  Check,
  Save,
  Store,
} from "lucide-react"
import {
  EQUIPMENT,
  TICKETS,
  ROUTES,
  RETURN_SLOTS,
  PAY_METHODS,
  TICKET_GRADES,
  DENSITY,
  money,
  fmtDate,
  type Variant,
  type IntakeApi,
  type Density,
} from "@/lib/pos-data"
import { SectionCard, Field, TextInput, SegmentedControl, Stepper } from "@/components/pos-primitives"

export function PosIntake({ variant, api }: { variant: Variant; api: IntakeApi }) {
  const d = DENSITY[variant]
  const { state, patch, setQty, setOpt, setTicketQty, reset, totals } = api
  const single = d.layout === "single"

  /* ---------- 고객 정보 ---------- */
  const customer = (
    <SectionCard d={d} icon={<UserRound className="size-5" />} title="고객 정보" desc="대표자 연락처로 접수와 안내가 진행됩니다">
      <div className={`grid ${d.fieldGrid}`}>
        <Field d={d} label="대표자 이름">
          <TextInput d={d} value={state.name} onChange={(v) => patch({ name: v })} placeholder="예) 김도윤" />
        </Field>
        <Field d={d} label="연락처">
          <TextInput d={d} value={state.phone} onChange={(v) => patch({ phone: v })} placeholder="010-0000-0000" inputMode="tel" />
        </Field>
        <Field d={d} label="이용 인원">
          <div className="flex items-center gap-4">
            <Counter d={d} label="성인" value={state.adults} onChange={(n) => patch({ adults: n })} min={1} />
            <Counter d={d} label="아동" value={state.children} onChange={(n) => patch({ children: n })} />
          </div>
        </Field>
        <Field d={d} label="방문 경로" full={d.fieldGrid.includes("grid-cols-2")}>
          <SegmentedControl d={d} options={ROUTES} value={state.route} onChange={(v) => patch({ route: v })} />
        </Field>
      </div>
    </SectionCard>
  )

  /* ---------- 이용 기간 · 수령/반납 ---------- */
  const period = (
    <SectionCard d={d} icon={<CalendarDays className="size-5" />} title="이용 기간 · 수령 / 반납" desc="날짜와 수령·반납 방법을 지정하세요">
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          <DateBox d={d} caption="이용 시작" main={fmtDate(state.startISO)} />
          <DateBox d={d} caption="이용 종료" main={fmtDate(state.startISO, state.days - 1)} />
        </div>
        <div className="flex items-center justify-between rounded-xl bg-muted border border-border px-3.5 py-2.5">
          <span className={`${d.label} font-semibold text-muted-foreground`}>이용 일수</span>
          <Counter d={d} label="일" value={state.days} onChange={(n) => patch({ days: Math.max(1, n) })} min={1} />
        </div>
        <div className={`grid ${d.fieldGrid}`}>
          <Field d={d} label="수령 방법">
            <SegmentedControl d={d} options={["매장 수령", "차량 배달"]} value={state.pickup} onChange={(v) => patch({ pickup: v })} />
          </Field>
          <Field d={d} label="반납 방법">
            <SegmentedControl d={d} options={["매장 반납", "차량 수거"]} value={state.returnMethod} onChange={(v) => patch({ returnMethod: v })} />
          </Field>
          <Field d={d} label="반납 타임" full={d.fieldGrid.includes("grid-cols-2")}>
            <SegmentedControl d={d} options={RETURN_SLOTS} value={state.returnSlot} onChange={(v) => patch({ returnSlot: v })} />
          </Field>
        </div>
      </div>
    </SectionCard>
  )

  /* ---------- 장비 옵션 ---------- */
  const equipment = (
    <SectionCard
      d={d}
      icon={<Snowflake className="size-5" />}
      title="장비 옵션"
      desc="필요한 장비 수량을 조절하세요"
      right={<CountBadge d={d} n={totals.itemCount} unit="개" />}
    >
      <div className={`grid ${d.equipCols}`}>
        {EQUIPMENT.map((e) => {
          const n = state.qty[e.id] || 0
          const on = n > 0
          return (
            <div
              key={e.id}
              className={`rounded-xl border p-3 transition-colors ${on ? "border-primary/45 bg-soft/50" : "border-border bg-card"}`}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <strong className={`${d.sectionDesc} font-bold text-foreground text-[15px] break-keep`}>{e.name}</strong>
                    <span className={`${d.chip} shrink-0 rounded-md bg-muted font-medium text-muted-foreground`}>{e.group}</span>
                  </div>
                  <small className={`${d.label} text-muted-foreground`}>{money(e.price)} / 1일</small>
                </div>
                <Stepper d={d} value={n} onChange={(v) => setQty(e.id, v)} />
              </div>
              {on && e.options.length > 0 ? (
                <div className="mt-2.5 border-t border-border/70 pt-2.5">
                  <SegmentedControl
                    d={{ ...d, seg: single ? "h-9 px-2.5 text-[13px]" : "h-10 px-3 text-[14px]" } as typeof d}
                    options={e.options}
                    value={state.opt[e.id] || e.options[0]}
                    onChange={(v) => setOpt(e.id, v)}
                  />
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )

  /* ---------- 리프트권 ---------- */
  const tickets = (
    <SectionCard
      d={d}
      icon={<TicketCheck className="size-5" />}
      title="리프트권"
      desc="구분을 먼저 고르고 매수를 입력하세요"
      right={<CountBadge d={d} n={totals.ticketCount} unit="매" />}
    >
      <div className="grid gap-3">
        <SegmentedControl d={d} options={TICKET_GRADES} value={state.ticketGrade} onChange={(v) => patch({ ticketGrade: v })} />
        <div className="grid gap-2.5">
          {TICKETS.map((t) => {
            const n = state.ticketQty[t.id] || 0
            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${n > 0 ? "border-primary/45 bg-soft/50" : "border-border bg-card"}`}
              >
                <div className="min-w-0 flex-1">
                  <strong className="text-[15px] font-bold text-foreground">{t.name}</strong>
                  <small className={`${d.label} block text-muted-foreground`}>{money(t.price)} / 1매</small>
                </div>
                <Stepper d={d} value={n} onChange={(v) => setTicketQty(t.id, v)} />
              </div>
            )
          })}
        </div>
      </div>
    </SectionCard>
  )

  /* ---------- 결제 내역 ---------- */
  const paymentBody = (
    <div className="grid gap-3">
      <div className="grid gap-1">
        {totals.lines.length === 0 ? (
          <p className={`${d.lineLabel} rounded-xl bg-muted px-3 py-4 text-center text-muted-foreground`}>
            선택한 장비나 리프트권이 없습니다.
          </p>
        ) : (
          totals.lines.map((l, i) => (
            <div key={i} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/60 last:border-0">
              <div className="min-w-0">
                <p className={`${d.lineLabel} font-medium text-foreground break-keep`}>{l.label}</p>
                <p className={`${d.label} text-muted-foreground tabular-nums`}>{l.detail}</p>
              </div>
              <span className={`${d.lineAmt} shrink-0 font-semibold tabular-nums text-foreground`}>{money(l.amount)}</span>
            </div>
          ))
        )}
      </div>

      <SummaryLine d={d} label="소계" value={money(totals.subtotal)} />
      <div className="flex items-center justify-between gap-3">
        <span className={`${d.lineLabel} font-medium text-muted-foreground`}>할인</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => patch({ discount: Math.max(0, state.discount - 5000) })}
            className={`${d.stepBtn} grid place-items-center rounded-xl border border-input bg-card text-foreground active:bg-muted`}
            aria-label="할인 줄이기"
          >
            −
          </button>
          <span className={`${d.lineAmt} w-24 text-right font-semibold tabular-nums text-primary`}>-{money(state.discount)}</span>
          <button
            type="button"
            onClick={() => patch({ discount: state.discount + 5000 })}
            className={`${d.stepBtn} grid place-items-center rounded-xl border border-input bg-card text-foreground active:bg-muted`}
            aria-label="할인 늘리기"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-soft px-4 py-3">
        <span className={`${d.sectionTitle} font-bold text-foreground`}>합계</span>
        <strong className={`${d.totalAmt} font-extrabold tabular-nums text-soft-foreground`}>{money(totals.total)}</strong>
      </div>

      <Field d={d} label="결제 수단">
        <SegmentedControl d={d} options={PAY_METHODS} value={state.payMethod} onChange={(v) => patch({ payMethod: v })} wrap={false} />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border bg-muted px-3 py-2.5">
          <p className={`${d.label} text-muted-foreground`}>받은 금액</p>
          <p className={`${d.lineAmt} font-bold tabular-nums text-foreground`}>{money(state.prepaid)}</p>
        </div>
        <div className="rounded-xl border border-blue/25 bg-blue-soft px-3 py-2.5">
          <p className={`${d.label} text-blue`}>받을 잔액</p>
          <p className={`${d.lineAmt} font-bold tabular-nums text-blue`}>{money(totals.balance)}</p>
        </div>
      </div>
    </div>
  )

  const ctaButtons = (
    <div className="grid grid-cols-[1fr_auto] gap-2.5">
      <button
        type="button"
        className={`${d.cta} inline-flex items-center justify-center gap-2 rounded-2xl bg-primary font-bold text-primary-foreground hover:bg-primary-hover active:bg-primary-hover`}
      >
        <Check className="size-6" strokeWidth={2.4} />
        접수 완료 · {money(totals.total)}
      </button>
      <button
        type="button"
        className={`${d.ctaSub} inline-flex items-center justify-center gap-2 rounded-2xl border border-input bg-card px-4 font-semibold text-foreground hover:bg-muted`}
      >
        <Save className="size-5" />
        임시 저장
      </button>
    </div>
  )

  /* ---------- 헤더 ---------- */
  const header = (
    <header className="shrink-0 flex items-center gap-3 border-b border-border bg-card px-4 py-3">
      <button
        type="button"
        aria-label="뒤로"
        className={`${d.iconBox} grid shrink-0 place-items-center rounded-xl border border-input bg-card text-muted-foreground hover:bg-muted`}
      >
        <ChevronLeft className="size-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className={`${d.title} font-extrabold leading-none tracking-tight`}>새 대여 접수</h1>
          <span className={`${d.chip} rounded-md bg-soft font-semibold text-soft-foreground`}>R-028</span>
        </div>
        {!single ? (
          <p className={`${d.subtitle} text-muted-foreground mt-1 break-keep`}>고객 정보 · 장비 옵션 · 결제 내역을 한 화면에서 처리합니다</p>
        ) : null}
      </div>
      {!single ? (
        <div className="hidden items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2 lg:flex">
          <Store className="size-4 text-muted-foreground" />
          <span className={`${d.label} font-medium text-muted-foreground`}>만선 스키샵 · 담당 이서연</span>
        </div>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className={`${d.iconBox === "h-8 w-8" ? "h-8" : "h-11"} inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-input bg-card px-3 ${d.label} font-semibold text-muted-foreground hover:bg-muted`}
      >
        <RotateCcw className="size-4" />
        초기화
      </button>
    </header>
  )

  /* ---------- 조립 ---------- */
  const formColumn = (
    <div className={`grid ${d.bodyGap}`}>
      {customer}
      {period}
      {equipment}
      {tickets}
    </div>
  )

  return (
    <div className={`flex h-full w-full flex-col overflow-hidden bg-background ${d.root}`}>
      {header}

      {single ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-3.5">
            <div className={`grid ${d.bodyGap}`}>
              {formColumn}
              <SectionCard d={d} icon={<ReceiptText className="size-5" />} title="결제 내역">
                {paymentBody}
              </SectionCard>
            </div>
          </div>
          <div className="shrink-0 border-t border-border bg-card px-3.5 py-3">
            <div className="mb-2.5 flex items-end justify-between">
              <div>
                <p className={`${d.label} text-muted-foreground`}>받을 잔액</p>
                <p className={`${d.lineAmt} font-bold tabular-nums text-blue`}>{money(totals.balance)}</p>
              </div>
              <div className="text-right">
                <p className={`${d.label} text-muted-foreground`}>합계</p>
                <p className={`text-[22px] font-extrabold tabular-nums text-soft-foreground`}>{money(totals.total)}</p>
              </div>
            </div>
            {ctaButtons}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="pos-scroll min-h-0 flex-1 overflow-y-auto p-4">{formColumn}</div>
          <aside className={`${d.sidebar} flex min-h-0 shrink-0 flex-col border-l border-border bg-card`}>
            <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3.5">
              <span className={`${d.iconBox} grid shrink-0 place-items-center rounded-xl bg-soft text-soft-foreground`}>
                <ReceiptText className="size-5" />
              </span>
              <div>
                <h3 className={`${d.sectionTitle} font-bold`}>결제 내역</h3>
                <p className={`${d.sectionDesc} text-muted-foreground`}>{state.payMethod} 결제 예정</p>
              </div>
            </div>
            <div className="pos-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">{paymentBody}</div>
            <div className="shrink-0 border-t border-border px-4 py-3.5">{ctaButtons}</div>
          </aside>
        </div>
      )}
    </div>
  )
}

/* ---------- 보조 컴포넌트 ---------- */

function Counter({
  d,
  label,
  value,
  onChange,
  min = 0,
}: {
  d: Density
  label: string
  value: number
  onChange: (n: number) => void
  min?: number
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={`${d.label} font-medium text-muted-foreground`}>{label}</span>
      <Stepper d={d} value={value} onChange={onChange} min={min} />
    </div>
  )
}

function DateBox({ d, caption, main }: { d: Density; caption: string; main: string }) {
  return (
    <button
      type="button"
      className="flex flex-col items-start gap-1 rounded-xl border border-input bg-card px-3.5 py-3 text-left hover:border-primary/50 hover:bg-soft/40"
    >
      <span className={`${d.label} font-medium text-muted-foreground`}>{caption}</span>
      <span className="flex items-center gap-2 text-[17px] font-bold text-foreground">
        <CalendarDays className="size-5 text-primary" />
        {main}
      </span>
    </button>
  )
}

function SummaryLine({ d, label, value }: { d: Density; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`${d.lineLabel} font-medium text-muted-foreground`}>{label}</span>
      <span className={`${d.lineAmt} font-semibold tabular-nums text-foreground`}>{value}</span>
    </div>
  )
}

function CountBadge({ d, n, unit }: { d: Density; n: number; unit: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 ${d.label} font-semibold text-foreground`}>
      선택 <strong className="tabular-nums text-primary">{n}</strong>
      {unit}
    </span>
  )
}
