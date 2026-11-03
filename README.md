# session-queue

**English** · [한국어](README.ko.md)

A mod for the Code tab of the Claude desktop app. It gathers the sessions that are waiting on you and lists them oldest first, so work you hand off to a session doesn't get forgotten. The sidebar and its folder groups stay as they are.

## What you get

- **Band above the prompt**: `⏳ 3 sessions waiting · oldest 2d · …`. Click it to open the queue pane.
- **Queue pane**: the sessions waiting on you from the last 2 weeks, oldest first, each with how long it has waited, its folder, its title and what it needs from you. Click a title to open that session. **Done** hides a session until its next turn ends. Sessions older than 2 weeks are folded away.
- **`/queue` command**: opens the queue pane. Sent from Remote Control on your phone, it replies with a text list instead.

The session you are looking at and scheduled-task sessions are left out.

## What counts as waiting

| Label | Meaning |
|---|---|
| Needs reply | The sidebar shows a dot: Claude is waiting for your answer or decision |
| Unmarked question | Claude left a question, but the app did not mark the session with a dot |
| Error | The session stopped with an error in the last 7 days |

## Language

The mod follows the first language in your Mac's preferred languages (System Settings → General → Language & Region): Korean if that is Korean, English otherwise.

## Install

In the desktop app: click **+** next to the prompt → **Plugins** → **Add marketplace**, enter `byywkim/session-queue`, then choose session-queue under **Add plugin**.

In Claude Code in a terminal:

```
/plugin install session-queue --marketplace byywkim/session-queue
```

Answer `y` to `Add marketplace?`, and keep the first install scope, user (press Enter). From a shell, one line does the same:

```
claude plugin install session-queue --marketplace byywkim/session-queue
```

The band shows up in sessions you open after installing.

## Requirements

- macOS and the Claude desktop app (Code tab)
- `/usr/bin/python3`: if it is missing, macOS offers to install the Command Line Tools.

## Good to know

- The mod reads the app's session records on this Mac (`~/Library/Application Support/Claude/claude-code-sessions/`) every minute and whenever a turn ends. Nothing it reads leaves your Mac.
- It reads the app's internal record format, so an app update can change how it behaves.
- To keep the mod quiet in folders where nobody watches the band (for example, a folder only scheduled tasks use), create `skip-folders.txt` in the mod's folder (the Path that `claude plugin list` shows) and write one folder name per line. After an update, check that the file is still there.
- For more reliable dots, add this line to your CLAUDE.md: "When a turn ends with something left for me to do (an answer, a decision, sending something, a check), set `blocked: true` in the wrap-up (wrap_up)."
