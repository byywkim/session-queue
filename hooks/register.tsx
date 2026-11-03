import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { QueueRow } from '../types'
import { age, isSkipped, listText, parseScan, pick, rowHead, rowNeed, toDismissed, withDismissed } from './queue'

const PANE = 'session-queue'
const TITLE = '대기열'
// 엔진은 명령 이름을 영문·숫자·_·-로만 받는다(한글 '대기열'은 등록이 거부됨)
const COMMAND = 'queue'
const REFRESH_MS = 60 * 1000
const PYTHON = '/usr/bin/python3'
// 이 파일에 적은 폴더에서 연 세션에서는 쉰다(예약 실행 전용 폴더처럼 띠를 볼 사람이 없는 곳).
// 사람마다 다른 폴더 이름이라 저장소에는 올리지 않는다(.gitignore)
const SKIP_FILE = 'skip-folders.txt'

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

// 스캔이 겹치지 않게: 돌고 있으면 그 결과를 같이 기다린다
let scanning: Promise<void> | null = null

function refresh($: EngineInterface): Promise<void> {
  scanning ??= scanOnce($).finally(() => {
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
      throw new Error(ran.stderr.trim().split('\n').pop() || `종료 코드 ${ran.exitCode}`)
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

async function dismiss($: EngineInterface, row: QueueRow): Promise<void> {
  const kept = withDismissed(toDismissed(await $.store.get('dismissed')), row)
  await $.store.set('dismissed', kept)
  await update($, dismissed, () => kept)
}

async function openSession($: EngineInterface, sid: string): Promise<void> {
  // 앱 Spotlight가 세션을 열 때 쓰는 주소. sid 모양은 parseScan이 이미 걸렀다
  const ran = await $.process.run(['/usr/bin/open', `claude://code/continue?session=${sid}`], {
    timeoutMs: 10 * 1000,
  })
  if (ran.exitCode !== 0) $.ui.toast('세션을 열지 못했습니다')
}

async function openPane($: EngineInterface): Promise<void> {
  await $.ui.open({ id: PANE, title: TITLE })
  await refresh($)
}

async function rowsNow($: EngineInterface) {
  const snap = await read($, snapshot)
  if (snap === null) return null
  return { snap, rows: pick(snap, await read($, dismissed), await read($, self)) }
}

async function answer($: EngineInterface, isPhone: boolean): Promise<{ text: string }> {
  await refresh($)
  const now = await rowsNow($)
  if (now === null) return { text: '세션 기록을 아직 읽지 못했습니다.' }
  // 휴대폰(원격 제어)은 패널을 그리지 않으므로 글 목록으로 답한다
  if (isPhone) return { text: listText(now.snap, now.rows) }
  await $.ui.open({ id: PANE, title: TITLE })

  return { text: `기다리는 세션 ${now.rows.recent.length}개 — 대기열 패널을 열었습니다.` }
}

const FAILED = { text: '대기열을 읽지 못했습니다.' }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    // 파일이 없으면 쉬는 폴더도 없다
    const skip = await $.fs.read(`${$.plugin.root}/${SKIP_FILE}`).catch(() => '')
    if (isSkipped(e.cwd, typeof skip === 'string' ? skip : '')) {
      await update($, off, () => true)
      return started
    }
    // 명령 등록이 막혀도 띠·패널은 돌게 한다
    await $.command
      .register({ name: COMMAND, description: '대기열: 나를 기다리는 세션을 오래 기다린 순으로' })
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
    () => FAILED,
  )

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, off))) return next(e)
    const now = await rowsNow($)
    const oldest = now?.rows.recent[0]
    if (now === null || oldest === undefined) return next(e)
    const head = `⏳ 기다리는 세션 ${now.rows.recent.length}개`
    const tail = `가장 오래 기다린 것 ${age(now.snap.at - oldest.since)} · ${oldest.title}`
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text>{`${head} · ${tail} · /${COMMAND}`}</Text>
    }
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Button key="open-queue" plain onPress={() => openPane($)}>
          {head} <Text dimColor>{`· ${tail}`}</Text>
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const now = await rowsNow($)
    if (now === null) return <Text dimColor>세션 기록을 읽는 중입니다…</Text>
    const { snap, rows } = now
    const isOlderShown = await read($, showOlder)
    // 세션 열기는 이 맥에서 앱 주소를 여는 것이라 휴대폰 화면에서는 뺀다
    const canOpen = e.surface !== 'mobile'
    const line = (row: QueueRow) => (
      <Box key={`row-${row.sid}`} flexDirection="column" marginBottom={1}>
        {canOpen ? (
          <Button key={`open-${row.sid}`} plain onPress={() => openSession($, row.sid)}>
            {rowHead(row, snap.at)}
          </Button>
        ) : (
          <Text>{rowHead(row, snap.at)}</Text>
        )}
        <Text dimColor>{rowNeed(row)}</Text>
        <Button key={`done-${row.sid}`} plain dimColor label="처리함" onPress={() => dismiss($, row)} />
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text dimColor>오래 기다린 순 · 제목을 누르면 그 세션이 열립니다</Text>
        {rows.recent.length === 0 && <Text>2주 안에 기다리는 세션이 없습니다.</Text>}
        {rows.recent.map(line)}
        {rows.older.length > 0 && (
          <Button key="toggle-older" plain dimColor onPress={() => update($, showOlder, shown => !shown)}>
            {isOlderShown ? '2주 넘은 것 접기' : `2주 넘은 것 ${rows.older.length}개 보기`}
          </Button>
        )}
        {isOlderShown && rows.older.map(line)}
        <Text dimColor>
          {`1분마다 새로 읽음${snap.scheduled > 0 ? ` · 예약 실행 세션 ${snap.scheduled}개 제외` : ''}`}
        </Text>
        {snap.error !== null && <Text color="warning">{`기록을 읽지 못했습니다: ${snap.error}`}</Text>}
      </Box>
    )
  })
}
