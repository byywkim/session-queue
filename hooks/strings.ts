import type { Lang, QueueKind } from '../types'

// 화면에 나오는 글. 언어는 세션이 시작할 때 맥의 첫째 언어로 정한다(pickLang)
export type Strings = {
  pane: string
  command: string
  untitled: string
  noNote: string
  kind: Record<QueueKind, string>
  ago: {
    now: string
    minutes: (n: number) => string
    hours: (n: number) => string
    days: (n: number) => string
  }
  waiting: (n: number) => string
  oldest: (age: string, title: string) => string
  loading: string
  hint: string
  empty: string
  done: string
  hideOlder: string
  showOlder: (n: number) => string
  footer: (scheduled: number) => string
  readError: (message: string) => string
  openFailed: string
  notRead: string
  opened: (n: number) => string
  failed: string
  none: string
  onlyOlder: (n: number) => string
  listHead: (n: number) => string
  olderNote: (n: number) => string
  todoPane: string
  todoHint: string
  todoEmpty: string
  todoLoading: string
  todoDone: string
  todoUpdated: (age: string) => string
  todoReadError: (message: string) => string
  linkFailed: string
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

export const STRINGS: Record<Lang, Strings> = {
  en: {
    pane: 'Queue',
    command: 'Queue: sessions waiting on you, oldest first',
    untitled: '(untitled)',
    noNote: '(no note)',
    kind: { ask: 'Needs reply', silent: 'Unmarked question', failed: 'Error' },
    ago: { now: 'just now', minutes: n => `${n}m`, hours: n => `${n}h`, days: n => `${n}d` },
    waiting: n => `⏳ ${count(n, 'session')} waiting`,
    oldest: (age, title) => `oldest ${age} · ${title}`,
    loading: 'Reading session records…',
    hint: 'Oldest first · click a title to open that session',
    empty: 'No sessions waiting on you in the last 2 weeks.',
    done: 'Done',
    hideOlder: 'Hide older than 2 weeks',
    showOlder: n => `Show ${n} older than 2 weeks`,
    footer: n => `Refreshes every minute${n > 0 ? ` · ${count(n, 'scheduled session')} left out` : ''}`,
    readError: message => `Could not read session records: ${message}`,
    openFailed: 'Could not open the session',
    notRead: 'Session records have not been read yet.',
    opened: n => `${count(n, 'session')} waiting — opened the queue pane.`,
    failed: 'Could not read the queue.',
    none: 'No sessions waiting on you.',
    onlyOlder: n =>
      `No sessions waiting on you in the last 2 weeks. ${n} older than 2 weeks: see the queue pane on your Mac.`,
    listHead: n => `${count(n, 'session')} waiting (oldest first)`,
    olderNote: n => `${n} older than 2 weeks: see the queue pane on your Mac.`,
    todoPane: 'To-do',
    todoHint: 'Click a line to open it · Done hides it here and changes nothing at the source',
    todoEmpty: 'Nothing left on the list.',
    todoLoading: 'Reading the list file…',
    todoDone: 'Done',
    todoUpdated: age => `List updated ${age} ago`,
    todoReadError: message => `Could not read the list file: ${message}`,
    linkFailed: 'Could not open the link',
  },
  ko: {
    pane: '대기열',
    command: '대기열: 나를 기다리는 세션을 오래 기다린 순으로',
    untitled: '(제목 없음)',
    noNote: '(남은 일 문구 없음)',
    kind: { ask: '답 필요', silent: '점 없는 질문', failed: '오류' },
    ago: { now: '방금', minutes: n => `${n}분`, hours: n => `${n}시간`, days: n => `${n}일` },
    waiting: n => `⏳ 기다리는 세션 ${n}개`,
    oldest: (age, title) => `가장 오래 기다린 것 ${age} · ${title}`,
    loading: '세션 기록을 읽는 중입니다…',
    hint: '오래 기다린 순 · 제목을 누르면 그 세션이 열립니다',
    empty: '2주 안에 기다리는 세션이 없습니다.',
    done: '처리함',
    hideOlder: '2주 넘은 것 접기',
    showOlder: n => `2주 넘은 것 ${n}개 보기`,
    footer: n => `1분마다 새로 읽음${n > 0 ? ` · 예약 실행 세션 ${n}개 제외` : ''}`,
    readError: message => `기록을 읽지 못했습니다: ${message}`,
    openFailed: '세션을 열지 못했습니다',
    notRead: '세션 기록을 아직 읽지 못했습니다.',
    opened: n => `기다리는 세션 ${n}개 — 대기열 패널을 열었습니다.`,
    failed: '대기열을 읽지 못했습니다.',
    none: '기다리는 세션이 없습니다.',
    onlyOlder: n =>
      `2주 안에 기다리는 세션은 없습니다. 2주 넘은 것 ${n}개는 맥의 대기열 패널에서 볼 수 있습니다.`,
    listHead: n => `기다리는 세션 ${n}개 (오래 기다린 순)`,
    olderNote: n => `2주 넘은 것 ${n}개는 맥의 대기열 패널에서 볼 수 있습니다.`,
    todoPane: '할 일',
    todoHint: '줄을 누르면 원문이 열립니다 · 처리는 여기서만 숨기고 원문은 바꾸지 않습니다',
    todoEmpty: '남은 할 일이 없습니다.',
    todoLoading: '목록 파일을 읽는 중입니다…',
    todoDone: '처리',
    todoUpdated: age => `목록 갱신 ${age} 전`,
    todoReadError: message => `목록 파일을 읽지 못했습니다: ${message}`,
    linkFailed: '링크를 열지 못했습니다',
  },
}

// `defaults read -g AppleLanguages`가 낸 목록의 첫째 항목이 한국어(ko, ko-KR…)면 ko, 그 밖에는 en
export function pickLang(appleLanguages: string): Lang {
  const first = appleLanguages.replace(/[()"]/g, ' ').split(/[\s,]+/).find(Boolean) ?? ''
  return /^ko(?:[-_]|$)/i.test(first) ? 'ko' : 'en'
}
