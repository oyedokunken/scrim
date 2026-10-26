# 0004. Session folder and session file format

Status: proposed (for the owner to accept or change)

## Context

A recording is more than one video. It is a screen track, an optional camera track, an optional
microphone track, a log of mouse input and the facts needed to line them up. A recording must
never be lost (CLAUDE.md, rule 9), so the format has to survive a crash at any moment, tell a
later launch what happened, and let recovery rebuild a playable file without guessing.

## Decision

One folder per recording, `<name>.scrim`, inside the destination folder the user chose.

```
<name>.scrim/
  session.json          metadata, heartbeat and the clean close marker
  screen.raw.webm       raw chunks as they arrived (extension follows the recorder type)
  camera.raw.webm       optional
  mic.raw.webm          optional
  input.ndjson          raw mouse events, kept until the log is converted and verified
  <name>.scrim.json     the validated input log, session log version 1
  edits.json            the edit list (empty in Phase 2)
  screen.webm           playable copy made by remuxing, never replaces the raw file
```

- Time. The main process owns one clock, milliseconds since the recording started. Track start
  times, pause intervals and raw input events all use it. The recorder page clock is related to it
  by an offset and an uncertainty, measured with a ping exchange, and both are stored.
- `session.json` is version 1 and is validated with zod on every read and write. It is rewritten
  atomically (temp file, fsync, rename, retrying on `EPERM` and `EBUSY`) after each sync, so the
  last good copy is always whole. It records the owning process id, so recovery can tell a crash
  from a recording that is still running.
- `cleanClose` becomes true only after every track is complete and the input log is converted.
  Recovery sets it with `recovered: true`.
- Raw files are append only. Nothing ever rewrites, truncates or deletes them, including recovery
  and export. Remuxing writes a new file next to them.
- `input.ndjson` is one JSON object per line, flushed with the video tracks, so a crash loses at
  most the last partial line. There is no keyboard event in the format, by design.
- An index of session folder paths (paths only) lives in the app data folder so recovery finds
  sessions in any destination.

## Consequences

- A crash costs at most the last two seconds, the sync interval.
- The folder is self describing and can be copied or opened by hand. The raw files play in most
  players even before recovery.
- Version 1 is a commitment. A change needs a version bump and a reader for the old one.
- Open for the owner: whether `session.json` should hold the folder's absolute path (it does not
  today, so a moved folder still opens), and whether the remuxed copy should be named after the
  recording rather than the track.
