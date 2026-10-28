import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloseAsker } from '../../src/main/shell/close-asker';

describe('the close asker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the question and resolves with the answer', async () => {
    const send = vi.fn(() => true);
    const asker = createCloseAsker({ send });
    const pending = asker.ask(true);
    expect(send).toHaveBeenCalledWith(true);
    asker.answer('shown');
    asker.answer('stop');
    await expect(pending).resolves.toBe('stop');
  });

  it('waits as long as the person takes once the page says the question is on screen', async () => {
    const asker = createCloseAsker({ send: () => true, timeoutMs: 1000 });
    const settled = vi.fn();
    void asker.ask(false).then(settled);
    asker.answer('shown');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).not.toHaveBeenCalled();
    asker.answer('keep');
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledWith('keep');
  });

  it('gives up with null when the page never says it is showing the question', async () => {
    const asker = createCloseAsker({ send: () => true, timeoutMs: 1000 });
    const pending = asker.ask(true);
    await vi.advanceTimersByTimeAsync(1001);
    await expect(pending).resolves.toBeNull();
  });

  it('answers null at once when there is no page to ask', async () => {
    const asker = createCloseAsker({ send: () => false });
    await expect(asker.ask(true)).resolves.toBeNull();
  });

  it('does not open a second question while one is open, and ignores a late answer', async () => {
    const send = vi.fn(() => true);
    const asker = createCloseAsker({ send });
    const first = asker.ask(true);
    await expect(asker.ask(true)).resolves.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    asker.answer('cancel');
    await expect(first).resolves.toBe('cancel');
    expect(() => {
      asker.answer('stop');
    }).not.toThrow();
  });
});
