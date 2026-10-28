import type { AudioPiece } from '@scrim/core/render';

const RATE = 48000;

function seconds(ms: number): string {
  return (Math.max(0, ms) / 1000).toFixed(6);
}

export interface AudioGraph {
  /** The `-filter_complex` text. Its result is the stream labelled `[aout]`. */
  filter: string;
  label: 'aout';
}

/**
 * The FFmpeg graph that builds the finished sound from the microphone file: each kept stretch is
 * cut out of the file at its own time and the stretches are joined in order, with silence where
 * the microphone had not started or had already stopped. Because the pieces come from the render
 * plan, sound and picture agree to the sample, whatever was cut. Returns null when there is
 * nothing to build.
 */
export function buildAudioGraph(
  pieces: readonly AudioPiece[],
  options: { micInput: number; gain: number },
): AudioGraph | null {
  if (pieces.length === 0) return null;
  const mics = pieces.filter((piece) => piece.micStartMs !== null).length;
  const lines: string[] = [];
  const format = `aformat=sample_fmts=fltp:sample_rates=${String(RATE)}:channel_layouts=stereo`;
  if (mics === 1) {
    lines.push(`[${String(options.micInput)}:a]${format}[mic0]`);
  } else if (mics > 1) {
    const names = Array.from({ length: mics }, (_, i) => `[mic${String(i)}]`).join('');
    lines.push(`[${String(options.micInput)}:a]${format},asplit=${String(mics)}${names}`);
  }
  let micIndex = 0;
  const labels: string[] = [];
  for (const [i, piece] of pieces.entries()) {
    const label = `[p${String(i)}]`;
    labels.push(label);
    if (piece.micStartMs === null) {
      lines.push(
        `anullsrc=r=${String(RATE)}:cl=stereo,atrim=duration=${seconds(piece.durationMs)},asetpts=PTS-STARTPTS${label}`,
      );
    } else {
      const input = `[mic${String(micIndex)}]`;
      micIndex += 1;
      lines.push(
        `${input}atrim=start=${seconds(piece.micStartMs)}:end=${seconds(piece.micStartMs + piece.durationMs)},asetpts=PTS-STARTPTS,apad=whole_dur=${seconds(piece.durationMs)}${label}`,
      );
    }
  }
  const gain = Number.isFinite(options.gain) && options.gain > 0 ? options.gain : 1;
  lines.push(
    `${labels.join('')}concat=n=${String(pieces.length)}:v=0:a=1,volume=${gain.toFixed(3)},alimiter=limit=0.97[aout]`,
  );
  return { filter: lines.join(';'), label: 'aout' };
}
