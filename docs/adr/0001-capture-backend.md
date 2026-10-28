# 0001. Capture backend

Status: accepted by the owner, 2026-10-26

## Context

Scrim records the screen, the camera and the microphone, and must never lose a recording
(CLAUDE.md, rule 9). The plan assumed Chromium capture (`desktopCapturer` with
`setDisplayMediaRequestHandler`, recorded by `MediaRecorder`) and asked for a spike to confirm it.
This was measured on Windows 11 with Electron 44, a 1920 by 1080 display at 150 percent scale.

## Decision

Capture with Chromium and record each track with its own `MediaRecorder`, one chunk per second,
streamed to disk by the main process. Four points came out of the measurements and are part of
the decision.

1. **The system cursor stays in the video.** `getDisplayMedia` was asked for `cursor: 'never'`.
   Chromium reported the setting back as `always`, and a frame taken from the recording shows the
   arrow. The constraint is ignored for screen capture on Windows. The owner accepts this. The
   session file records it as `capture.cursorInCapture: true` and the app shows no warning,
   because it is the expected behavior. Cursor effects are drawn on top at export, from the input
   log. If restyled cursors that replace the real one are ever wanted, the way to get a video
   without a cursor is to capture with FFmpeg and `draw_mouse 0` (`ddagrab` or `gdigrab`), which
   would replace this backend for the screen track only. The session format, writer and recovery
   do not change.

2. **`video/mp4;codecs=avc1` is not used.** It is supported, but it ignores the timeslice. In a
   six second test it delivered nothing until the recorder stopped, then everything at once. A
   crash would lose the whole recording. WebM delivered a chunk every second. The order is now
   `video/webm;codecs=h264`, then `vp9`, then `vp8`, with `audio/webm;codecs=opus`. All four
   types were reported as supported. Put mp4 back only if a later Chromium streams it. H.264 in
   WebM is remuxed to mp4 and VP8 or VP9 stays WebM, both with `-c copy`.

3. **Chunks are copied, not transferred.** A message that carried an `ArrayBuffer` in the transfer
   list arrived in the main process as `null`. `MessagePortMain` clones buffers. The recorder page
   posts each chunk without a transfer list. A second of footage is a megabyte or two, so the copy
   is not a cost that matters.

4. **A video track's time zero is the capture time of its first frame.** The recorder reports
   `start` a second or so after it was started (1.2 to 1.9 s), but its first frame is stamped near
   the call. Every video frame carries the time it was captured, on the system's steady clock. The
   recorder page reads those with a `MediaStreamTrackProcessor`, picks the first frame seen after
   `start()` was called, and sends its timestamp. On Windows that clock is the same one the main
   process reads with `process.hrtime`, so the main process takes the timestamp as it is. As a
   check, the same time is also worked out through the page clock and the clock sync, and the two
   agreed to within 1.5 to 2.5 ms in six runs. When they disagree by more than the sync's
   uncertainty plus 25 ms, the page clock one is used, so a system where the clocks differ still
   works. Only when frame times cannot be read at all does the time fall back to the call plus 90
   ms, a delay measured on one machine. The microphone has no such lag and uses its own start
   report, and its recorded length matched the clock to within 40 ms in every run.

5. **The video shows an event 37 to 89 ms after it happens.** With time zero exact, the marker test
   still showed each flip in the video later than the page drew it: run medians of 37, 54, 80, 85,
   89 and 63 ms, mean 68, spread within a run mostly 30 to 95 ms. That is the screen being
   composed and captured, and no timestamp removes it. Because the cursor is part of the video, a
   halo drawn at an event's own time would sit ahead of the real cursor by that long, so the saved
   input log adds 68 ms to every event time and records it as `latencyMs`. With that added, the
   run medians fall within plus or minus 31 ms, one frame at 30 fps. Single events still land up to
   about two frames either side, because the capture is 30 frames a second. The marker is drawn
   through the page compositor and the cursor is not, so for the cursor alone the figure is
   probably a little high. Measuring the cursor itself needs synthetic mouse input, which this
   machine's rules do not allow a helper script to do.

6. **Variable frame rate.** A static desktop sends about one frame a second, so a screen file can
   end a second or more before the recording did. Every track stores `stoppedAt`, the main clock
   time at which its recorder stopped (the end of the recording for a track that never reported
   one, as after a crash). **For Phase 3:** export must hold the last frame of a track until
   `stoppedAt` and convert to a constant frame rate, so every track is exactly as long as
   `trackMediaDuration(startedAt, stoppedAt, pauses)` says. Do not trust the container's own
   duration.

## Consequences

- Recording survives a hard kill. Twenty kill and recover runs in a row each produced a playable
  file of at least 3 seconds.
- Cursor effects at export must paint over the real cursor or live with it in the frame.
- The display latency of 68 ms is measured on one machine. Other machines and other platforms need
  the same marker test before the number is trusted. `SCRIM_DEV_MARKER=1` runs it, and
  `SCRIM_DEV_TRACE=1` prints the timing marks for every track.
- **No network at all while recording.** A net log of a recording showed one name lookup: Chromium
  asking for a host called `wpad` at startup, to find a proxy configuration. The app starts with
  `--no-proxy-server`, and the net log is then empty. An end to end test records, pauses, stops and
  recovers with a net log, and fails on any request outside `app://scrim/` or any name lookup. It
  first fetches a page from a server on the same computer and requires the log to show it, so an
  empty log cannot pass by accident. The optional update check will need its own session if it has
  to go through a proxy.
