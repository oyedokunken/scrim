# 0003. Export pipeline

Status: accepted (decided by the export owner for v1, to be reviewed by the owner after v1)

The v1 plan called this ADR 0002, but that number was already taken by the landing CSP decision, and
CLAUDE.md leaves 0003 free for the export pipeline, so it lives here.

## Context

Export turns the raw tracks, the input log and the edit list into one MP4: screen, camera bubble,
cursor halo and ripples, auto zoom, background, and the microphone as AAC. The bundled FFmpeg is an
LGPL build, so there is no libx264. A spike measured these paths on a mid range laptop (Intel
i7 1185G7), as multiples of real time:

| Step                                                       | Speed                      |
| ---------------------------------------------------------- | -------------------------- |
| Decode of the screen track                                 | 3.55x                      |
| h264_qsv encode                                            | 3.47x                      |
| h264_mf encode                                             | 1.82x                      |
| FFmpeg filter graph for zoom and overlay                   | 1.57x                      |
| libx264 veryfast (not available in the LGPL build)         | 1.33x                      |
| Drawing in a hidden page, frames sent over MessagePortMain | about 12 frames per second |

## Decision

FFmpeg decodes the screen and the camera to raw pictures at a constant frame rate (`fps` filter
with `start_time=0`, so the first picture is time zero and gaps repeat the last picture). The main
process draws each finished picture with a small compositor written in plain TypeScript
(`apps/desktop/src/main/export/compositor.ts`): bilinear zoom with a sub pixel view, rounded
corners, shadow and background (built once), halo, ripples and the camera bubble. The pictures go
to a second FFmpeg through a pipe, which encodes H.264 and AAC into `<name>.mp4.partial`. The file
is read back with ffprobe (H.264, yuv420p, planned size, AAC when there is sound, planned length)
and only then renamed into place.

Why not the others:

- A hidden page: the picture transport, not the drawing, is the limit.
- An FFmpeg filter graph alone: zoom needs a per frame view with sub pixel positions, and the
  `crop` and `scale` filters round to whole pixels, which makes slow pans shake. The zoom is the
  feature the owner cares about most.

Encoder: the first of `h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_videotoolbox`, `h264_vaapi`,
`h264_mf`, `libopenh264` that really encodes a few test frames at the export size. The retry with
safer settings uses `libopenh264` and one size step down.

Time: every time in the session is moved to start at the first screen frame (`rebaseSession`),
because the input log and the bubble positions count from there. Sound is built from the render
plan's pieces (`buildAudioGraph`), so cuts and trims cut picture and sound at the same instants.

## Consequences

- No new dependency and no extra window. Cancel kills the three processes and removes the partial.
- Drawing is single threaded JavaScript. It is the slowest step. On this machine, with another
  process using every core, the compositor measured about 100 ms per 1080p frame and a 28.7 second
  recording took 113 to 140 seconds, which is not real time. On an idle machine the same loop
  should be several times faster, but this has not been measured. The next step if it falls short
  is a pool of worker threads that each draw a band of rows into shared memory. The compositor
  already works on plain byte arrays so it can move without a rewrite.
- Zoom, halo and bubble drawing exist twice (the editor preview in a canvas and this one). A test
  on the same session keeps them close, but they can drift.
