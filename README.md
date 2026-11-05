# session-queue

**English** · [한국어](README.ko.md)

A mod for the Code tab of the Claude desktop app. It gathers the sessions that are waiting on you and lists them oldest first, so work you hand off to a session doesn't get forgotten. The sidebar and its folder groups stay as they are.

## What you get

- **Band above the prompt**: `⏳ 3 sessions waiting · oldest 2d · …`. Click it to open the queue pane.
- **Queue pane**: the sessions waiting on you from the last 2 weeks, oldest first, each with how long it has waited, its folder, its title and what it needs from you. Click a title to open that session. **Done** hides a session until its next turn ends. Sessions older than 2 weeks are folded away.
- **`/queue` command**: opens the queue pane. Sent from Remote Control on your phone, it replies with a text list instead.
- **To-do counts (optional)**: `✉ Reply 3 · ✅ Today 2` on the right of the band, from a list file you point the mod at. See [To-do lists](#to-do-lists-optional).

The session you are looking at and scheduled-task sessions are left out.

## What counts as waiting

| Label | Meaning |
|---|---|
| Needs reply | Claude is waiting for your answer or decision: the sidebar shows a dot, or a choice dialog is open in the middle of a turn |
| Unmarked question | Claude left a question, but the app did not mark the session with a dot |
| Error | The session stopped with an error in the last 7 days |

## To-do lists (optional)

The band can also count lines from a JSON file that something else keeps up to date, such as a scheduled task that reads your mail and chat. Click the counts to open the **To-do** pane: one line per item, with **Done** beside it. Click a line to open its link.

**Done** only hides the line here. It changes nothing at the source, and the line comes back if the file later gives it a new `since`, for example when a new message arrives.

To turn it on, create `lists-file.txt` in the mod's folder (the Path that `claude plugin list` shows) and put the absolute path of your list file on the first line. The mod reads the file every minute. Without `lists-file.txt`, the mod works as if this feature did not exist.

```json
{
  "updatedAt": "2026-11-05T08:30:00+09:00",
  "lists": [
    {
      "key": "reply",
      "icon": "✉",
      "label": "Reply",
      "note": "",
      "items": [
        {
          "id": "mail:1842",
          "text": "Sam — confirm the new copy",
          "source": "Mail",
          "since": "2026-11-04T16:10:00+09:00",
          "href": "https://mail.example.com/1842"
        }
      ]
    }
  ]
}
```

`key`, `id` and `text` are required. `since` adds how long the line has waited, and `href` makes the line clickable: only `https://` links are accepted. On a phone, `/queue` lists these lines with their links.

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

- The mod reads the app's session records on this Mac (`~/Library/Application Support/Claude/claude-code-sessions/`) every minute and whenever a turn ends. Open sessions share the result through a small file in `~/Library/Caches/session-queue/`. Nothing it reads leaves your Mac.
- The app keeps no record of an open choice dialog, so for sessions whose turn has not ended the mod also reads the end of the conversation log in `~/.claude/projects/`. Tool permission prompts are not listed.
- It reads the app's internal record format, so an app update can change how it behaves.
- To keep the mod quiet in folders where nobody watches the band (for example, a folder only scheduled tasks use), create `skip-folders.txt` in the mod's folder (the Path that `claude plugin list` shows) and write one folder name per line. After an update, check that the file is still there.
- For more reliable dots, add this line to your CLAUDE.md: "When a turn ends with something left for me to do (an answer, a decision, sending something, a check), set `blocked: true` in the wrap-up (wrap_up)."

## License

[MIT](LICENSE)
