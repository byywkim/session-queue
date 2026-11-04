"""대기열 Mod의 스캐너: 데스크톱 앱이 세션마다 남기는 상태 기록을 읽어,
사용자를 기다리는 세션만 JSON 한 줄로 낸다.

기록 파일 하나가 1MB 안팎(커넥터 설정 사본)이라, Mod가 직접 읽지 않고
이 스크립트가 필요한 칸만 뽑아 넘긴다.

판정은 앱이 사이드바에 점을 찍는 기준과 같다.
- 끝맺음(turnWrapUp)에 needsUser가 있으면 '답 필요'(ask): 사이드바에 점이 찍힌다.
- 끝맺음이 있는데 needsUser가 없고 분류기가 blocked·need_input이라고 했으면
  '점 없는 질문'(silent): 앱은 검토 대기로 바꾸고 점을 지우지만, 원래 문구는 남아 있다.
- 끝맺음이 없고 분류기가 blocked·need_input이면 '답 필요'(ask).
- 분류기가 failed면 '오류'(failed): 앱처럼 마지막 활동 7일 안만.
사용자가 새 메시지를 보내면 앱이 두 칸을 비우므로, 답한 세션은 저절로 빠진다.

세션마다 1분에 한 번 이 스크립트를 부른다. 기록을 전부 읽는 일은 한 번에 CPU 0.3초쯤이라,
결과를 잠깐 파일에 두고 세션끼리 나눠 쓴다.
"""
import glob
import json
import os
import sys
import tempfile
import time
import unicodedata

BASE = os.path.expanduser('~/Library/Application Support/Claude/claude-code-sessions')
CACHE = os.path.expanduser('~/Library/Caches/session-queue/scan.json')
CACHE_MS = 45 * 1000
FAILED_MS = 7 * 24 * 3600 * 1000
WAITING = ('blocked', 'need_input')


def nfc(text):
    return unicodedata.normalize('NFC', text) if isinstance(text, str) else ''


def one_line(text, limit=160):
    text = ' '.join(nfc(text).split())
    return text if len(text) <= limit else text[:limit - 1] + '…'


def classify(record, now_ms):
    summary = record.get('postTurnSummary')
    summary = summary if isinstance(summary, dict) else {}
    wrap = record.get('turnWrapUp')
    wrap = wrap if isinstance(wrap, dict) else None
    raw = summary.get('status_category')
    if raw == 'failed':
        if now_ms - int(record.get('lastActivityAt') or 0) >= FAILED_MS:
            return None
        return 'failed', summary.get('needs_action') or summary.get('status_detail') or ''
    if wrap is not None:
        if isinstance(wrap.get('needsUser'), str):
            return 'ask', wrap['needsUser']
        if raw in WAITING:
            return 'silent', summary.get('needs_action') or ''
        return None
    if raw in WAITING:
        return 'ask', summary.get('needs_action') or ''
    return None


def scan(base, now_ms):
    rows = []
    scheduled = 0
    for path in glob.glob(os.path.join(base, '*', '*', 'local_*.json')):
        try:
            with open(path, encoding='utf-8') as handle:
                record = json.load(handle)
        except (OSError, ValueError):
            continue
        if record.get('isArchived'):
            continue
        found = classify(record, now_ms)
        if found is None:
            continue
        if record.get('scheduledTaskId'):
            scheduled += 1
            continue
        kind, text = found
        since = int(record.get('lastTurnEdgeAt') or record.get('lastActivityAt') or 0)
        folder = nfc(os.path.basename((record.get('originCwd') or record.get('cwd') or '').rstrip('/')))
        rows.append({
            'sid': record.get('sessionId'),
            'cli': record.get('cliSessionId'),
            # 제목이 없으면 비워 둔다: Mod가 화면 언어로 '(제목 없음)'을 넣는다
            'title': one_line(record.get('title') or '', 80),
            'folder': folder,
            'kind': kind,
            'text': one_line(text),
            'since': since,
            # '처리함'을 이 턴에만 묶는 표시: 새 턴이 끝나면 값이 바뀌어 다시 뜬다
            'marker': str(record.get('postTurnSummaryFor') or since),
        })
    return {'at': now_ms, 'rows': rows, 'scheduled': scheduled}


def cached(now_ms):
    try:
        if now_ms - os.path.getmtime(CACHE) * 1000 >= CACHE_MS:
            return None
        with open(CACHE, encoding='utf-8') as handle:
            return handle.read()
    except OSError:
        return None


def remember(text):
    # 세션 여럿이 한꺼번에 써도 깨지지 않게 임시 파일을 쓰고 바꿔 끼운다. 못 써도 스캔은 계속한다
    folder = os.path.dirname(CACHE)
    try:
        os.makedirs(folder, exist_ok=True)
        fd, temp = tempfile.mkstemp(dir=folder)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(text)
        os.replace(temp, CACHE)
    except OSError:
        pass


def main():
    now_ms = int(time.time() * 1000)
    # 폴더를 직접 준 실행(시험)은 나눠 쓰지 않는다
    if len(sys.argv) > 1:
        json.dump(scan(sys.argv[1], now_ms), sys.stdout, ensure_ascii=False)
        return
    text = cached(now_ms)
    if text is None:
        text = json.dumps(scan(BASE, now_ms), ensure_ascii=False)
        remember(text)
    sys.stdout.write(text)


if __name__ == '__main__':
    main()
