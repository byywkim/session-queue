import { expect, mock, test } from 'claude-code/testing'

const NOW = Date.UTC(2026, 10, 2, 13, 0, 0)
const DAY = 24 * 60 * 60 * 1000

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

// 엔진 자리를 대신하는 훅들: 스캐너는 SCAN을, 세션 id는 'cli-self'를, 쉬는 폴더 목록 파일은 skip을 낸다.
// $.store는 들여다볼 수 있게 Map으로 받는다
function engine(on: Parameters<Parameters<typeof test>[1]>[1], skip = '') {
  const ran: string[][] = []
  const stored = new Map<string, unknown>()
  mock.clock(on, { now: NOW })
  on('store.get', (_, e) => ({ value: stored.get(e.key) }))
  on('store.set', (_, e) => {
    stored.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'queue' } }))
  on('session.id', () => ({ value: 'cli-self' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('fs.read', () => ({ value: skip }))
  on('process.run', (_, e) => {
    ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: JSON.stringify(SCAN), stderr: '' } }
  })
  return { ran, stored }
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
  engine(on)
  await $.session.start({ cwd: '/', surface: 'mobile', isInteractive: true })
  const { text } = await $.command.run({ command: 'queue', origin: { kind: 'bridge' } })
  expect(text).toMatch(/기다리는 세션 2개/)
  expect(text).toMatch(/1\. 13일 · 프로젝트B · 일정 조율/)
  expect(text).toMatch(/2주 넘은 것 1개/)
})
