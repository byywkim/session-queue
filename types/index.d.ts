// 스캐너(scripts/scan_sessions.py)가 내는 줄. kind: ask = 답 필요(사이드바 점 있음),
// silent = 점 없는 질문(앱이 점을 지운 질문), failed = 오류(7일 안)
export type QueueKind = 'ask' | 'silent' | 'failed'

export type QueueRow = {
  sid: string
  cli: string
  // 비어 있으면 화면 언어의 '(제목 없음)'으로 보인다
  title: string
  folder: string
  kind: QueueKind
  text: string
  since: number
  marker: string
}

export type QueueScan = { at: number; rows: QueueRow[]; scheduled: number }

export type QueueSnapshot = QueueScan & { error: string | null }

// '처리함'으로 숨긴 세션: 세션 id → 그때의 턴 표시(marker). 새 턴이 끝나 표시가 바뀌면 다시 뜬다
export type Dismissed = Record<string, string>

// 화면 글의 언어: 맥의 첫째 언어가 한국어면 ko, 아니면 en
export type Lang = 'en' | 'ko'

declare module 'claude-code' {
  interface PluginState {
    'session-queue': {
      snapshot: Shaped<QueueSnapshot | null>
      dismissed: Shaped<Dismissed>
      showOlder: boolean
      self: string | null
      // 쉬는 폴더(skip-folders.txt)에서 연 세션이면 true: 스캔·띠·명령을 모두 쉰다
      off: boolean
      lang: Lang
    }
  }
}
