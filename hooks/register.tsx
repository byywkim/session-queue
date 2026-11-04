import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QueueRow, TodoItem } from '../types'
import {
  age,
  isSkipped,
  itemMeta,
  listsPath,
  listText,
  parseScan,
  parseTodo,
  pick,
  rowHead,
  rowNeed,
  titleOf,
  toDismissed,
  todoCounts,
  todoText,
  todoUpdated,
  visibleLists,
  withDismissed,
  withHandled,
} from './queue'
import { pickLang, STRINGS } from './strings'

const PANE = 'session-queue'
const TODO_PANE = 'session-queue-todo'
// 엔진은 명령 이름을 영문·숫자·_·-로만 받는다(한글 '대기열'은 등록이 거부됨)
const COMMAND = 'queue'
const REFRESH_MS = 60 * 1000
const PYTHON = '/usr/bin/python3'
// 이 파일에 적은 폴더에서 연 세션에서는 쉰다(예약 실행 전용 폴더처럼 띠를 볼 사람이 없는 곳).
// 사람마다 다른 폴더 이름이라 저장소에는 올리지 않는다(.gitignore)
const SKIP_FILE = 'skip-folders.txt'
// 이 파일에 적은 경로의 목록 파일을 띠 오른쪽 숫자와 '할 일' 패널로 보여 준다.
// 사람마다 다른 경로라 저장소에는 올리지 않는다(.gitignore)
const LISTS_CONF = 'lists-file.txt'
// 맥이 고른 언어 순서. 첫째 항목이 화면 언어를 정한다
const LANGUAGES = ['/usr/bin/defaults', 'read', '-g', 'AppleLanguages']

// 칸이 바뀌면 태그를 올린다: 예전 버전이 저장한 값은 버리고 처음 값으로 읽는다
const snapshot = atom({ plugin: 'session-queue', key: 'snapshot' } as const, null, {
  shape: 'snapshot-1',
})
const dismissed = atom({ plugin: 'session-queue', key: 'dismissed' } as const, {}, {
  shape: 'dismissed-1',
})
const showOlder = atom({ plugin: 'session-queue', key: 'showOlder' } as const, false)
const self = atom({ plugin: 'session-queue', key: 'self' } as const, null)
const off = atom({ plugin: 'session-queue', key: 'off' } as const, false)
const lang = atom({ plugin: 'session-queue', key: 'lang' } as const, 'en')
const listsFile = atom({ plugin: 'session-queue', key: 'listsFile' } as const, null)
const todo = atom({ plugin: 'session-queue', key: 'todo' } as const, null, { shape: 'todo-1' })
const handled = atom({ plugin: 'session-queue', key: 'handled' } as const, {}, {
  shape: 'handled-1',
})

// 스캔이 겹치지 않게: 돌고 있으면 그 결과를 같이 기다린다
let scanning: Promise<void> | null = null

function refresh($: EngineInterface): Promise<void> {
  scanning ??= Promise.all([scanOnce($), readTodo($)])
    .then(() => undefined)
    .finally(() => {
      scanning = null
    })
  return scanning
}

async function scanOnce($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  try {
    const ran = await $.process.run(
      [PYTHON, '-I', `${$.plugin.root}/scripts/scan_sessions.py`],
      { timeoutMs: 20 * 1000 },
    )
    if (ran.exitCode !== 0) {
      throw new Error(ran.stderr.trim().split('\n').pop() || `exit code ${ran.exitCode}`)
    }
    const scan = parseScan(ran.stdout)
    // 다른 세션에서 누른 '처리함'도 반영한다
    const stored = toDismissed(await $.store.get('dismissed'))
    await update($, dismissed, () => stored)
    await update($, snapshot, () => ({ ...scan, error: null }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, snapshot, last => ({
      at: last?.at ?? now,
      rows: last?.rows ?? [],
      scheduled: last?.scheduled ?? 0,
      error: message,
    }))
  }
}

async function readTodo($: EngineInterface): Promise<void> {
  const path = await read($, listsFile)
  if (path === null) return
  const at = await $.clock.now()
  try {
    const text = await $.fs.read(path)
    const file = parseTodo(typeof text === 'string' ? text : '')
    // 다른 세션에서 누른 [처리]도 반영한다
    const stored = toDismissed(await $.store.get('handled'))
    await update($, handled, () => stored)
    await update($, todo, () => ({ ...file, at, error: null }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, todo, last => ({
      lists: last?.lists ?? [],
      updatedAt: last?.updatedAt ?? 0,
      at,
      error: message,
    }))
  }
}

async function strings($: EngineInterface) {
  return STRINGS[await read($, lang)]
}

async function dismiss($: EngineInterface, row: QueueRow): Promise<void> {
  const kept = withDismissed(toDismissed(await $.store.get('dismissed')), row)
  await $.store.set('dismissed', kept)
  await update($, dismissed, () => kept)
}

async function handleItem($: EngineInterface, item: TodoItem): Promise<void> {
  const kept = withHandled(toDismissed(await $.store.get('handled')), item)
  await $.store.set('handled', kept)
  await update($, handled, () => kept)
}

async function openLink($: EngineInterface, href: string): Promise<void> {
  // 주소 모양은 parseTodo가 이미 걸렀다(https만)
  const ran = await $.process.run(['/usr/bin/open', href], { timeoutMs: 10 * 1000 })
  if (ran.exitCode !== 0) $.ui.toast((await strings($)).linkFailed)
}

async function openSession($: EngineInterface, sid: string): Promise<void> {
  // 앱 Spotlight가 세션을 열 때 쓰는 주소. sid 모양은 parseScan이 이미 걸렀다
  const ran = await $.process.run(['/usr/bin/open', `claude://code/continue?session=${sid}`], {
    timeoutMs: 10 * 1000,
  })
  if (ran.exitCode !== 0) $.ui.toast((await strings($)).openFailed)
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: (await strings($)).pane })
  await refresh($)
}

async function openTodoPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: TODO_PANE, title: (await strings($)).todoPane })
  await refresh($)
}

async function rowsNow($: EngineInterface) {
  const snap = await read($, snapshot)
  if (snap === null) return null
  return { snap, rows: pick(snap, await read($, dismissed), await read($, self)) }
}

async function answer($: EngineInterface, isPhone: boolean): Promise<{ text: string }> {
  await refresh($)
  const t = await strings($)
  const now = await rowsNow($)
  if (now === null) return { text: t.notRead }
  // 휴대폰(원격 제어)은 패널을 그리지 않으므로 글 목록으로 답한다
  if (isPhone) {
    const snap = await read($, todo)
    const lists = visibleLists(snap, await read($, handled))
    const todoLines = todoText(lists, snap?.at ?? now.snap.at, t)

    return { text: [listText(now.snap, now.rows, t), todoLines].filter(Boolean).join('\n\n') }
  }
  await $.ui.open({ id: PANE, title: t.pane })

  return { text: t.opened(now.rows.recent.length) }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // 파일이 없으면 쉬는 폴더도 없다
    const skip = await $.fs.read(`${$.plugin.root}/${SKIP_FILE}`).catch(() => '')
    if (isSkipped(e.cwd, typeof skip === 'string' ? skip : '')) {
      await update($, off, () => true)
      return started
    }
    // 언어 순서를 못 읽으면 영어로 둔다
    const langs = await $.process.run(LANGUAGES, { timeoutMs: 5 * 1000 }).catch(() => null)
    const picked = pickLang(langs !== null && langs.exitCode === 0 ? langs.stdout : '')
    await update($, lang, () => picked)
    // 파일이 없으면 할 일 목록 없이 돈다
    const conf = await $.fs.read(`${$.plugin.root}/${LISTS_CONF}`).catch(() => '')
    const path = listsPath(typeof conf === 'string' ? conf : '')
    await update($, listsFile, () => path)
    // 명령 등록이 막혀도 띠·패널은 돌게 한다
    await $.command
      .register({ name: COMMAND, description: STRINGS[picked].command })
      .catch(() => undefined)
    const id = await $.session.id()
    await update($, self, () => id)
    void refresh($)
    $.clock.every(REFRESH_MS, () => refresh($))

    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!(await read($, off))) void refresh($)

    return done
  })

  on('command.run', { command: 'queue' }, ($, e) => answer($, e.origin?.kind === 'bridge')).catch(
    async $ => ({ text: (await strings($)).failed }),
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, off))) return next(e)
    const now = await rowsNow($)
    const oldest = now?.rows.recent[0]
    const counts = todoCounts(visibleLists(await read($, todo), await read($, handled)))
    if ((now === null || oldest === undefined) && counts === '') return next(e)
    const t = await strings($)
    const head = now === null || oldest === undefined ? '' : t.waiting(now.rows.recent.length)
    // 오른쪽에 숫자가 있으면 왼쪽을 줄여 한 줄에 둔다
    const tail =
      now === null || oldest === undefined || counts !== ''
        ? ''
        : t.oldest(age(now.snap.at - oldest.since, t), titleOf(oldest, t))
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text>{[head, tail, counts, `/${COMMAND}`].filter(Boolean).join(' · ')}</Text>
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const left =
      tail === '' ? (
        <Button key="open-queue" plain onPress={() => openPane($)}>
          {head}
        </Button>
      ) : (
        <Button key="open-queue" plain onPress={() => openPane($)}>
          {head} <Text dimColor>{`· ${tail}`}</Text>
        </Button>
      )

    return (
      <Box justifyContent={head === '' ? 'flex-end' : 'space-between'}>
        {head !== '' && left}
        {counts !== '' && (
          <Button key="open-todo" plain onPress={() => openTodoPane($)}>
            {counts}
          </Button>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await strings($)
    const now = await rowsNow($)
    if (now === null) return <Text dimColor>{t.loading}</Text>
    const { snap, rows } = now
    const isOlderShown = await read($, showOlder)
    // 세션 열기는 이 맥에서 앱 주소를 여는 것이라 휴대폰 화면에서는 뺀다
    const canOpen = e.surface !== 'mobile'
    const line = (row: QueueRow) => (
      <Box key={`row-${row.sid}`} flexDirection="column" marginBottom={1}>
        {canOpen ? (
          <Button key={`open-${row.sid}`} plain onPress={() => openSession($, row.sid)}>
            {rowHead(row, snap.at, t)}
          </Button>
        ) : (
          <Text>{rowHead(row, snap.at, t)}</Text>
        )}
        <Text dimColor>{rowNeed(row, t)}</Text>
        <Button key={`done-${row.sid}`} plain dimColor label={t.done} onPress={() => dismiss($, row)} />
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text dimColor>{t.hint}</Text>
        {rows.recent.length === 0 && <Text>{t.empty}</Text>}
        {rows.recent.map(line)}
        {rows.older.length > 0 && (
          <Button key="toggle-older" plain dimColor onPress={() => update($, showOlder, shown => !shown)}>
            {isOlderShown ? t.hideOlder : t.showOlder(rows.older.length)}
          </Button>
        )}
        {isOlderShown && rows.older.map(line)}
        <Text dimColor>{t.footer(snap.scheduled)}</Text>
        {snap.error !== null && <Text color="warning">{t.readError(snap.error)}</Text>}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: TODO_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const t = await strings($)
    const snap = await read($, todo)
    if (snap === null) return <Text dimColor>{t.todoLoading}</Text>
    const lists = visibleLists(snap, await read($, handled))
    // 링크 열기는 이 맥에서 여는 것이라 휴대폰 화면에서는 뺀다
    const canOpen = e.surface !== 'mobile'
    const line = (item: TodoItem) => (
      <Box key={`item-${item.id}`} justifyContent="space-between" gap={1} marginBottom={1}>
        <Box flexDirection="column" flexShrink={1}>
          {canOpen && item.href !== '' ? (
            <Button key={`go-${item.id}`} plain onPress={() => openLink($, item.href)}>
              {item.text}
            </Button>
          ) : (
            <Text>{item.text}</Text>
          )}
          <Text dimColor>{itemMeta(item, snap.at, t)}</Text>
        </Box>
        <Button key={`handle-${item.id}`} dimColor label={t.todoDone} onPress={() => handleItem($, item)} />
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text dimColor>{t.todoHint}</Text>
        {lists.every(list => list.items.length === 0) && <Text>{t.todoEmpty}</Text>}
        {lists.map(list => (
          <Box key={`list-${list.key}`} flexDirection="column" marginTop={1}>
            <Text bold>{[list.icon, list.label].filter(Boolean).join(' ')}</Text>
            {list.note !== '' && <Text dimColor>{list.note}</Text>}
            {list.items.map(line)}
          </Box>
        ))}
        {snap.updatedAt > 0 && <Text dimColor>{todoUpdated(snap, t)}</Text>}
        {snap.error !== null && <Text color="warning">{t.todoReadError(snap.error)}</Text>}
      </Box>
    )
  })
}
