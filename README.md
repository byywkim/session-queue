# session-queue — 대기열 Mod

Claude 데스크톱 앱의 Code 탭에서, 나를 기다리는 세션을 오래 기다린 순으로 모아 보여 주는 Mod입니다. 세션에 일을 맡겨 두고 잊는 일을 줄이려고 만들었습니다. 사이드바의 폴더 묶음은 그대로 둡니다.

## 보이는 것

- **입력창 위 띠**: `⏳ 기다리는 세션 n개 · 가장 오래 기다린 것 …`. 누르면 대기열 패널이 열립니다.
- **대기열 패널**: 2주 안에 나를 기다리는 세션을 오래 기다린 순으로 보여 줍니다(기다린 시간·폴더·제목·남은 일). 제목을 누르면 그 세션이 열립니다. '처리함'을 누르면 그 세션의 다음 턴이 끝날 때까지 목록에서 빠집니다. 2주 넘은 것은 접어 둡니다.
- **`/queue` 명령**: 대기열 패널을 엽니다. 휴대폰 원격 제어에서는 글 목록으로 답합니다.

지금 보고 있는 세션과 예약 실행(스케줄) 세션은 목록에서 뺍니다.

## '기다리는 세션'의 기준

| 표시 | 뜻 |
|---|---|
| 답 필요 | 사이드바에 점이 찍힌 세션(Claude가 답이나 결정을 기다림) |
| 점 없는 질문 | 질문을 남겼지만 앱이 점을 찍지 않은 세션 |
| 오류 | 최근 7일 안에 오류로 멈춘 세션 |

## 설치

데스크톱 앱에서: 입력창 옆 **+** → **Plugins** → **Add marketplace**에 `byywkim/session-queue`를 넣고, **Add plugin**에서 session-queue를 고릅니다.

터미널의 Claude Code에서:

```
/plugin install session-queue --marketplace byywkim/session-queue
```

`Add marketplace?`에는 `y`를 누르고, 설치 범위는 맨 위의 user를 그대로 고릅니다(Enter). 셸에서는 다음 한 줄로도 됩니다.

```
claude plugin install session-queue --marketplace byywkim/session-queue
```

설치한 뒤 새로 여는 세션부터 띠가 뜹니다.

## 필요한 것

- macOS와 Claude 데스크톱 앱(Code 탭)
- `/usr/bin/python3`: 없으면 macOS가 Command Line Tools 설치를 묻습니다.

## 알아 둘 점

- 이 맥에 있는 앱 세션 기록(`~/Library/Application Support/Claude/claude-code-sessions/`)을 1분마다, 그리고 턴이 끝날 때마다 읽습니다. 읽은 내용은 어디로도 보내지 않습니다.
- 앱 내부 기록 형식을 읽으므로, 앱이 업데이트되면 동작이 달라질 수 있습니다.
- 띠를 볼 사람이 없는 폴더(예: 예약 실행 전용 폴더)에서는 Mod를 쉬게 할 수 있습니다. Mod 폴더(`claude plugin list`의 Path)에 `skip-folders.txt`를 만들고 폴더 이름을 한 줄에 하나씩 적습니다. 업데이트 뒤에는 파일이 남아 있는지 확인하세요.
- 점이 더 잘 찍히게 하려면 CLAUDE.md에 다음 한 줄을 넣어 두세요. "턴을 끝낼 때 사용자가 할 일(답·결정·발송·확인)이 남았으면, 끝맺음(wrap_up)에 `blocked: true`를 넣는다."
