import type { Dismissed, QueueKind, QueueRow, QueueScan } from '../types'
import type { Strings } from './strings'

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

// 이보다 오래 기다린 세션은 '2주 넘은 것'으로 접어 둔다
export const RECENT_MS = 14 * DAY_MS
// '처리함' 기록은 최근 것만 남긴다($.store는 전체 4 MiB 한도)
export const DISMISSED_CAP = 500

// 앱이 세션 열기 주소(claude://code/continue)에서 받는 id 모양과 같다
const SESSION_ID = /^local_[A-Za-z0-9-]{1,64}$/
const KINDS: readonly string[] = ['ask', 'silent', 'failed']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function toRow(value: unknown): QueueRow[] {
  if (!isRecord(value)) return []
  const { sid, kind } = value
  if (typeof sid !== 'string' || !SESSION_ID.test(sid)) return []
  if (typeof kind !== 'string' || !KINDS.includes(kind)) return []
  return [
    {
      sid,
      cli: str(value.cli),
      // 제목이 없으면 비워 두고, 보여 줄 때 화면 언어로 채운다(titleOf)
      title: str(value.title),
      folder: str(value.folder),
      kind: kind as QueueKind,
      text: str(value.text),
      since: num(value.since),
      marker: str(value.marker),
    },
  ]
}

// 스캐너 출력 한 줄을 읽는다. 모양이 다른 줄은 버리고, 전체가 다르면 throw
export function parseScan(stdout: string): QueueScan {
  const raw: unknown = JSON.parse(stdout)
  if (!isRecord(raw) || !Array.isArray(raw.rows)) {
    throw new Error('unexpected scanner output')
  }
  return { at: num(raw.at), rows: raw.rows.flatMap(toRow), scheduled: num(raw.scheduled) }
}

// 쉬는 폴더 목록(한 줄에 폴더 이름 하나, #로 시작하면 설명)에 든 폴더가 작업 폴더 경로에 있으면 true.
// 맥 경로는 NFD일 수 있어 NFC로 맞춰 비교한다
export function isSkipped(cwd: string, list: string): boolean {
  const names = list
    .split('\n')
    .map(line => line.trim().normalize('NFC'))
    .filter(line => line !== '' && !line.startsWith('#'))
  const parts = cwd.normalize('NFC').split('/')
  return names.some(name => parts.includes(name))
}

export function toDismissed(value: unknown): Dismissed {
  if (!isRecord(value)) return {}
  const kept: Dismissed = {}
  for (const [sid, marker] of Object.entries(value)) {
    if (typeof marker === 'string') kept[sid] = marker
  }
  return kept
}

// 넣은 순서가 오래된 것부터 버린다
export function capDismissed(dismissed: Dismissed): Dismissed {
  const entries = Object.entries(dismissed)
  return Object.fromEntries(entries.slice(Math.max(0, entries.length - DISMISSED_CAP)))
}

export function withDismissed(dismissed: Dismissed, row: QueueRow): Dismissed {
  const rest = Object.fromEntries(Object.entries(dismissed).filter(([sid]) => sid !== row.sid))
  return capDismissed({ ...rest, [row.sid]: row.marker })
}

// 보여 줄 줄: 지금 세션과 '처리함'으로 숨긴 것을 빼고, 오래 기다린 순으로
export function pick(
  scan: QueueScan,
  dismissed: Dismissed,
  self: string | null,
): { recent: QueueRow[]; older: QueueRow[] } {
  const live = scan.rows
    .filter(row => row.cli !== self && dismissed[row.sid] !== row.marker)
    .sort((a, b) => a.since - b.since)
  return {
    recent: live.filter(row => scan.at - row.since < RECENT_MS),
    older: live.filter(row => scan.at - row.since >= RECENT_MS),
  }
}

export function age(ms: number, t: Strings): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE_MS)
  if (minutes < 1) return t.ago.now
  if (minutes < 60) return t.ago.minutes(minutes)
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t.ago.hours(hours)
  return t.ago.days(Math.floor(hours / 24))
}

export function titleOf(row: QueueRow, t: Strings): string {
  return row.title || t.untitled
}

export function rowHead(row: QueueRow, at: number, t: Strings): string {
  return [age(at - row.since, t), row.folder, titleOf(row, t)].filter(Boolean).join(' · ')
}

export function rowNeed(row: QueueRow, t: Strings): string {
  return `${t.kind[row.kind]} — ${row.text || t.noNote}`
}

// 패널이 없는 화면(휴대폰)과 명령 결과 줄에 쓰는 글 목록
export function listText(
  scan: QueueScan,
  rows: { recent: QueueRow[]; older: QueueRow[] },
  t: Strings,
): string {
  const { recent, older } = rows
  if (recent.length === 0) return older.length === 0 ? t.none : t.onlyOlder(older.length)
  const lines = [t.listHead(recent.length)]
  recent.forEach((row, index) => {
    lines.push(`${index + 1}. ${rowHead(row, scan.at, t)}`, `   ${rowNeed(row, t)}`)
  })
  if (older.length > 0) lines.push(t.olderNote(older.length))
  return lines.join('\n')
}
