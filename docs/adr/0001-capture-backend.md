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

4. **A video track's time zero is the `start()` call plus about 90 ms, not the start event.** The
   recorder reports `start` a second or so after it was started (1.16 to 1.23 s in the marker
   runs), but the first frame is stamped close to the call. A small always on top square flipped
   between black and white at irregular intervals while recording, with a pause in the middle,
   and the frames where each flip appears were compared with the logged flip times. Taking the
   start event as time zero made the video run about a second late. Taking the call time put
   the video 23 to 153 ms early over six runs, mean 92 ms, so the stored origin is the call time
   plus 90 ms. Within a recording the flips stay within 60 to 90 ms of each other across the
   pause, so the pause handling is sound. The remaining error is a run to run offset of about
   plus or minus 65 ms, which is two frames at 30 fps, not one. The microphone has no such lag
   and uses its own start report, and its recorded length matched the clock to within 40 ms in
   every run. If one frame of accuracy is needed, the next step is to read the capture time of
   each frame from the track (a `MediaStreamTrackProcessor` or a video frame callback) instead of
   using a constant.

## Consequences

- Recording survives a hard kill. Twenty kill and recover runs in a row each produced a playable
  file of at least 3 seconds.
- Cursor effects at export must paint over the real cursor or live with it in the frame.
- The latency constant is measured on one machine. Other machines and other platforms need the
  same marker test before the number is trusted. `SCRIM_DEV_MARKER=1` runs it.
- A static screen delivers about one frame a second, so a video file can end up to a second
  before the recording stopped. That is a property of the capture, not a clock error.
