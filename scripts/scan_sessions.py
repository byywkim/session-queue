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
"""
import glob
import json
import os
import sys
import time
import unicodedata

BASE = os.path.expanduser('~/Library/Application Support/Claude/claude-code-sessions')
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


if __name__ == '__main__':
    base = sys.argv[1] if len(sys.argv) > 1 else BASE
    json.dump(scan(base, int(time.time() * 1000)), sys.stdout, ensure_ascii=False)
