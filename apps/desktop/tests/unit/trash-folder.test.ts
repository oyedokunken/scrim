import { describe, expect, it, vi } from 'vitest';
import { trashWhenFree } from '../../src/main/recording/trash-folder';

const instantly = () => Promise.resolve();

describe('trashWhenFree', () => {
  it('stops the render and waits until it lets go before it recycles', async () => {
    const order: string[] = [];
    let busyChecks = 0;
    await trashWhenFree('folder', {
      cancel: () => order.push('cancel'),
      busy: () => {
        busyChecks += 1;
        return busyChecks < 4;
      },
      trash: () => {
        order.push('trash');
        return Promise.resolve();
      },
      sleep: instantly,
    });
    expect(order).toEqual(['cancel', 'trash']);
    expect(busyChecks).toBe(4);
  });

  it('tries again after a refusal and succeeds', async () => {
    const trash = vi
      .fn<(folder: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('Operation was aborted'))
      .mockResolvedValueOnce(undefined);
    await trashWhenFree('folder', { cancel: vi.fn(), busy: () => false, trash, sleep: instantly });
    expect(trash).toHaveBeenCalledTimes(2);
  });

  it('reports the refusal when every try fails', async () => {
    const trash = vi.fn(() => Promise.reject(new Error('Operation was aborted')));
    await expect(
      trashWhenFree('folder', { cancel: vi.fn(), busy: () => false, trash, sleep: instantly }),
    ).rejects.toThrow('Operation was aborted');
    expect(trash).toHaveBeenCalledTimes(4);
  });

  it('does not wait for ever on a render that never stops', async () => {
    const trash = vi.fn(() => Promise.resolve());
    await trashWhenFree('folder', { cancel: vi.fn(), busy: () => true, trash, sleep: instantly });
    expect(trash).toHaveBeenCalledOnce();
  });
});
