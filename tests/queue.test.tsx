import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 10, 2, 13, 0, 0)
const DAY = 24 * 60 * 60 * 1000

// `defaults read -g AppleLanguages`가 내는 모양: 첫째 항목이 화면 언어를 정한다
const KOREAN_MAC = '(\n    "ko-KR",\n    ko\n)\n'
const ENGLISH_MAC = '(\n    "en-US",\n    ko\n)\n'

const SCAN = {
  at: NOW,
  scheduled: 3,
  rows: [
    {
      sid: 'local_aaa',
      cli: 'cli-a',
      title: '보고서 초안',
      folder: '프로젝트A',
      kind: 'silent',
      text: '시안 채택 결정',
      since: NOW - 1 * DAY,
      marker: 'm-a',
    },
    {
      sid: 'local_bbb',
      cli: 'cli-b',
      title: '일정 조율',
      folder: '프로젝트B',
      kind: 'ask',
      text: '회의 시간 확정',
      since: NOW - 13 * DAY,
      marker: 'm-b',
    },
    {
      sid: 'local_self',
      cli: 'cli-self',
      title: '지금 세션',
      folder: '프로젝트C',
      kind: 'ask',
      text: '지금 세션 질문',
      since: NOW - 2 * DAY,
      marker: 'm-s',
    },
    {
      sid: 'local_old',
      cli: 'cli-o',
      title: '오래된 일',
      folder: '프로젝트B',
      kind: 'ask',
      text: '옛 질문',
      since: NOW - 30 * DAY,
      marker: 'm-o',
    },
    { sid: 'bad id', cli: 'x', title: 'x', folder: 'x', kind: 'ask', text: 'x', since: NOW, marker: 'x' },
  ],
}

// 목록 파일 시험값. 슬랙 줄은 링크가 있고, 메일 줄의 javascript: 주소는 받지 않아야 한다
const LISTS_PATH = '/Users/x/목록/todo.json'
const LISTS = {
  version: 1,
  updatedAt: new Date(NOW - 3 * 60 * 60 * 1000).toISOString(),
  lists: [
    {
      key: 'reply',
      icon: '✉',
      label: '답장',
      note: '',
      items: [
        {
          id: 'slack:C1/1.1',
          text: '홍길동 — 화면 문구 확인',
          source: '슬랙',
          since: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
          href: 'https://example.slack.com/archives/C1/p1',
        },
        {
          id: 'gmail:abc',
          text: '김철수 — 견적서 회신',
          source: '메일',
          since: new Date(NOW - 1 * DAY).toISOString(),
          href: 'javascript:alert(1)',
        },
      ],
    },
    {
      key: 'today',
      icon: '✅',
      label: '오늘',
      note: '09:30 주간회의',
      items: [{ id: 'asana:1/2026-11-02', text: '정산 기안 올리기', source: '아사나', since: '', href: '' }],
    },
    { key: 'empty', icon: '', label: '빈 목록', note: '', items: [] },
    { icon: '✗', label: 'key가 없는 목록은 버린다', items: [] },
  ],
}

const BAND = {
  plugin: 'session-queue',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'session-queue',
  component: 'Pane',
  requestId: 'session-queue',
  props: {
    title: '대기열',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const TODO_PANE = { ...PANE, requestId: 'session-queue-todo' } as const

// 엔진 자리를 대신하는 훅들: 스캐너는 SCAN을, 언어 순서는 langs를(null이면 읽기 실패),
// 세션 id는 'cli-self'를, 쉬는 폴더 목록 파일은 skip을 낸다. todo를 주면 목록 파일이 있는 맥이다.
// $.store·등록된 명령 설명·연 패널은 들여다볼 수 있게 받아 둔다
function engine(
  on: Parameters<Parameters<typeof test>[1]>[1],
  skip = '',
  langs: string | null = KOREAN_MAC,
  todo: { text: string } | null = null,
  scan: unknown = SCAN,
) {
  const ran: string[][] = []
  const stored = new Map<string, unknown>()
  const commands: string[] = []
  const opened: string[] = []
  mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_, e) => {
    stored.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', (_, e) => {
    commands.push(e.description)
    return { value: { command: 'queue' } }
  })
  on('session.id', () => ({ value: 'cli-self' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('fs.read', (_, e) => {
    if (e.path.endsWith('skip-folders.txt')) return { value: skip }
    if (e.path.endsWith('lists-file.txt') && todo !== null) return { value: `# 설명 줄\n${LISTS_PATH}\n` }
    if (e.path === LISTS_PATH && todo !== null) return { value: todo.text }
    return { deny: 'ENOENT' }
  })
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    if (e.argv[0] !== '/usr/bin/defaults') {
      return { value: { exitCode: 0, stdout: JSON.stringify(scan), stderr: '' } }
    }
    return langs === null
      ? { value: { exitCode: 1, stdout: '', stderr: 'does not exist' } }
      : { value: { exitCode: 0, stdout: langs, stderr: '' } }
  })
  return { ran, stored, commands, opened }
}

test('띠는 지금 세션을 빼고 2주 안 기다리는 세션 수를 보여 준다', async ($, on) => {
  engine(on, '예약실행\n')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    const band = await ui.find({ key: 'open-queue' })
    expect(band?.text).toMatch(/기다리는 세션 2개/)
    expect(band?.text).toMatch(/13일 · 일정 조율/)
    await ui.unmount()
  }

  const phone = await $.ui.mount({ ...BAND, surface: 'mobile' })
  expect((await phone.find({ type: 'Text', text: /\/queue/ }))?.text).toMatch(/기다리는 세션 2개/)
  await phone.unmount()
})

test('패널은 오래 기다린 순으로 보이고, 처리함을 누르면 빠진다', async ($, on) => {
  const { stored } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const heads = (await ui.findAll({ type: 'Button', text: /·/ })).map(found => found.text)
  expect(heads[0]).toMatch(/13일 · 프로젝트B · 일정 조율/)
  expect(heads[1]).toMatch(/1일 · 프로젝트A · 보고서 초안/)
  expect(await ui.find({ type: 'Text', text: /점 없는 질문 — 시안 채택 결정/ })).toBeDefined()
  expect(await ui.find({ key: 'open-local_self' })).toBeUndefined()
  expect(await ui.find({ key: 'open-local_old' })).toBeUndefined()

  await ui.press({ key: 'done-local_bbb' })
  expect(await ui.find({ key: 'open-local_bbb' })).toBeUndefined()
  expect(stored.get('dismissed')).toEqual({ local_bbb: 'm-b' })

  await ui.press({ key: 'toggle-older' })
  expect(await ui.find({ key: 'open-local_old' })).toBeDefined()
  await ui.unmount()
})

test('제목을 누르면 앱 주소로 그 세션을 연다', async ($, on) => {
  const { ran } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'open-local_aaa' })
  expect(ran).toContainEqual(['/usr/bin/open', 'claude://code/continue?session=local_aaa'])
  await ui.unmount()
})

test('쉬는 폴더 목록에 든 폴더의 세션에서는 스캔도 띠도 없다(경로가 NFD여도)', async ($, on) => {
  const { ran } = engine(on, '# 설명 줄\n예약실행\n')
  // 엔진 자리: Mod가 넘긴 띠는 엔진 것이 그려진다
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  const cwd = '/Users/x/Documents/Claude/Projects/프로젝트B/예약실행'.normalize('NFD')
  await $.session.start({ cwd, surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'open-queue' })).toBeUndefined()
  expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
  expect(ran).toHaveLength(0)
  await ui.unmount()
})

test('휴대폰에서 부른 /queue는 글 목록으로 답한다', async ($, on) => {
  const { commands } = engine(on)
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  expect(commands).toEqual(['대기열: 나를 기다리는 세션을 오래 기다린 순으로'])
  const { text } = await $.command.run({ command: 'queue', origin: { kind: 'bridge' } })
  expect(text).toMatch(/기다리는 세션 2개/)
  expect(text).toMatch(/1\. 13일 · 프로젝트B · 일정 조율/)
  expect(text).toMatch(/2주 넘은 것 1개/)
})

test('맥의 첫째 언어가 한국어가 아니면 명령·글 목록·띠·패널이 영어로 나온다', async ($, on) => {
  const { commands } = engine(on, '', ENGLISH_MAC)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(commands).toEqual(['Queue: sessions waiting on you, oldest first'])

  const { text } = await $.command.run({ command: 'queue', origin: { kind: 'bridge' } })
  expect(text).toMatch(/^2 sessions waiting \(oldest first\)/)
  expect(text).toMatch(/1\. 13d · 프로젝트B · 일정 조율/)
  expect(text).toMatch(/Needs reply — 회의 시간 확정/)
  expect(text).toMatch(/1 older than 2 weeks/)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const found = await band.find({ key: 'open-queue' })
  expect(found?.text).toMatch(/2 sessions waiting/)
  expect(found?.text).toMatch(/oldest 13d · 일정 조율/)
  await band.unmount()

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /Unmarked question — 시안 채택 결정/ })).toBeDefined()
  expect(await pane.find({ type: 'Text', text: /3 scheduled sessions left out/ })).toBeDefined()
  await pane.unmount()
})

test('맥의 언어 순서를 못 읽으면 영어로 둔다', async ($, on) => {
  const { commands } = engine(on, '', null)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(commands).toEqual(['Queue: sessions waiting on you, oldest first'])
  // 명령은 첫 스캔이 끝나길 기다리므로, 테스트가 끝난 뒤 스캔이 남지 않는다
  const { text } = await $.command.run({ command: 'queue', origin: { kind: 'bridge' } })
  expect(text).toMatch(/^2 sessions waiting/)
})

test('목록 파일이 없으면 띠에 숫자가 없고 패널을 열어도 기다리는 세션만 있다', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'open-todo' })).toBeUndefined()
  expect((await ui.find({ key: 'open-queue' }))?.text).toMatch(/가장 오래 기다린 것 13일/)
  await ui.unmount()
})

test('띠 오른쪽 숫자는 남은 줄을 세고, 누르면 할 일 패널이 열린다', async ($, on) => {
  const { opened } = engine(on, '', KOREAN_MAC, { text: JSON.stringify(LISTS) })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect((await ui.find({ key: 'open-todo' }))?.text).toBe('✉ 답장 2 · ✅ 오늘 1')
  // 오른쪽 숫자가 있으면 왼쪽은 세션 수만 남긴다
  expect((await ui.find({ key: 'open-queue' }))?.text).toBe('⏳ 기다리는 세션 2개')
  await ui.press({ key: 'open-todo' })
  expect(opened).toContain('session-queue-todo')
  await ui.unmount()

  const phone = await $.ui.mount({ ...BAND, surface: 'mobile' })
  expect((await phone.find({ type: 'Text', text: /\/queue/ }))?.text).toMatch(/오늘 1/)
  await phone.unmount()
})

test('기다리는 세션이 없어도 할 일이 있으면 띠가 뜬다', async ($, on) => {
  engine(on, '', KOREAN_MAC, { text: JSON.stringify(LISTS) }, { at: NOW, rows: [], scheduled: 0 })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'open-queue' })).toBeUndefined()
  expect((await ui.find({ key: 'open-todo' }))?.text).toMatch(/답장 2/)
  await ui.unmount()
})

test('줄을 누르면 https 링크가 열리고, 처리를 누르면 빠지며, 새 글로 since가 바뀌면 다시 뜬다', async ($, on) => {
  const todo = { text: JSON.stringify(LISTS) }
  const { ran, stored } = engine(on, '', KOREAN_MAC, todo)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  const ui = await $.ui.mount({ ...TODO_PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /슬랙 · 2시간/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /메일 · 1일/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^아사나$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /09:30 주간회의/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /목록 갱신 3시간 전/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /빈 목록/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /key가 없는/ })).toBeUndefined()

  await ui.press({ key: 'go-slack:C1/1.1' })
  expect(ran).toContainEqual(['/usr/bin/open', 'https://example.slack.com/archives/C1/p1'])
  // https가 아닌 주소는 받지 않아 누를 곳이 없다
  expect(await ui.find({ key: 'go-gmail:abc' })).toBeUndefined()

  await ui.press({ key: 'handle-slack:C1/1.1' })
  expect(await ui.find({ key: 'handle-slack:C1/1.1' })).toBeUndefined()
  expect(Object.keys(stored.get('handled') as object)).toEqual(['slack:C1/1.1'])

  const newer = structuredClone(LISTS)
  newer.lists[0].items[0].since = new Date(NOW).toISOString()
  todo.text = JSON.stringify(newer)
  await $.command.run({ command: 'queue' })
  expect(await ui.find({ key: 'handle-slack:C1/1.1' })).toBeDefined()
  await ui.unmount()
})

test('목록 파일이 깨지면 마지막 내용을 두고 오류를 보인다', async ($, on) => {
  const todo = { text: JSON.stringify(LISTS) }
  engine(on, '', KOREAN_MAC, todo)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'queue' })

  todo.text = '{깨진 파일'
  await $.command.run({ command: 'queue' })
  const ui = await $.ui.mount({ ...TODO_PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'handle-gmail:abc' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /목록 파일을 읽지 못했습니다/ })).toBeDefined()
  await ui.unmount()
})

test('휴대폰 /queue 글 목록에 할 일과 링크가 함께 나온다', async ($, on) => {
  engine(on, '', KOREAN_MAC, { text: JSON.stringify(LISTS) })
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  const { text } = await $.command.run({ command: 'queue', origin: { kind: 'bridge' } })
  expect(text).toMatch(/기다리는 세션 2개/)
  expect(text).toMatch(/✉ 답장 2\n1\. 홍길동 — 화면 문구 확인 \(슬랙 · 2시간\)\n {3}https:\/\/example/)
  expect(text).toMatch(/✅ 오늘 1 · 09:30 주간회의\n1\. 정산 기안 올리기 \(아사나\)/)
  expect(text).not.toMatch(/빈 목록/)
})
