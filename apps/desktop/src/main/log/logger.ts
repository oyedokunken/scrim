import { sanitizeFields } from './redact';

/** The file calls the logger makes, so a test can watch them and make them fail. */
export interface LoggerFs {
  mkdir(dir: string): Promise<void>;
  append(path: string, text: string): Promise<void>;
  /** Undefined when the file does not exist. */
  size(path: string): Promise<number | undefined>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export type LogLevel = 'info' | 'warn' | 'error';

export interface LoggerOptions {
  dir: string;
  fs: LoggerFs;
  /** The person's home folder, which is replaced by `~` in every line. */
  home: string;
  now?: () => Date;
  /** A file is rotated before it would grow past this. */
  maxBytes?: number;
  /** How many rotated files to keep next to the live one. */
  keep?: number;
  fileName?: string;
}

const join = (dir: string, name: string): string => `${dir.replace(/[\\/]+$/, '')}/${name}`;

/**
 * A small local log. It writes lines to one file in the logs folder, rotates it by size, and
 * never touches the network. Every line goes through the redaction in redact.ts first. Logging
 * never throws and never blocks the caller: a failed write is dropped.
 */
export function createLogger(options: LoggerOptions) {
  const {
    dir,
    fs,
    home,
    now = () => new Date(),
    maxBytes = 1_000_000,
    keep = 5,
    fileName = 'scrim.log',
  } = options;
  const live = join(dir, fileName);
  let queue: Promise<void> = Promise.resolve();
  let ready = false;

  async function rotate(): Promise<void> {
    await fs.remove(join(dir, `${fileName}.${keep}`));
    for (let index = keep - 1; index >= 1; index -= 1) {
      if ((await fs.size(join(dir, `${fileName}.${index}`))) !== undefined) {
        await fs.rename(join(dir, `${fileName}.${index}`), join(dir, `${fileName}.${index + 1}`));
      }
    }
    await fs.rename(live, join(dir, `${fileName}.1`));
  }

  async function write(line: string): Promise<void> {
    if (!ready) {
      await fs.mkdir(dir);
      ready = true;
    }
    const size = (await fs.size(live)) ?? 0;
    if (size > 0 && size + line.length > maxBytes) await rotate();
    await fs.append(live, line);
  }

  function log(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
    const clean = sanitizeFields(fields, home);
    const line = `${now().toISOString()} ${level} ${event} ${JSON.stringify(clean)}\n`;
    queue = queue.then(
      () => write(line),
      () => write(line),
    );
    queue = queue.catch(() => undefined);
  }

  return {
    info: (event: string, fields?: Record<string, unknown>) => {
      log('info', event, fields);
    },
    warn: (event: string, fields?: Record<string, unknown>) => {
      log('warn', event, fields);
    },
    error: (event: string, fields?: Record<string, unknown>) => {
      log('error', event, fields);
    },
    /** Resolves when everything logged so far has been written, or dropped. */
    flush: (): Promise<void> => queue,
    directory: dir,
  };
}

export type Logger = ReturnType<typeof createLogger>;
