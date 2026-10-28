import { describe, expect, it } from 'vitest';
import { assessDisk, DISK_FLOORS, formatBytes } from '../../src/main/recording/disk-space';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

describe('assessDisk', () => {
  it('refuses to start below the floor and allows it at the floor', () => {
    expect(assessDisk(DISK_FLOORS.startMinBytes - 1, 'start')).toBe('refuse');
    expect(assessDisk(DISK_FLOORS.startMinBytes, 'start')).toBe('ok');
    expect(assessDisk(500 * GB, 'start')).toBe('ok');
  });

  it('warns below the soft floor and stops below the hard floor while recording', () => {
    expect(assessDisk(10 * GB, 'recording')).toBe('ok');
    expect(assessDisk(DISK_FLOORS.softBytes, 'recording')).toBe('ok');
    expect(assessDisk(DISK_FLOORS.softBytes - 1, 'recording')).toBe('warn');
    expect(assessDisk(DISK_FLOORS.hardBytes, 'recording')).toBe('warn');
    expect(assessDisk(DISK_FLOORS.hardBytes - 1, 'recording')).toBe('stop');
    expect(assessDisk(0, 'recording')).toBe('stop');
  });

  it('keeps the floors in a sensible order', () => {
    expect(DISK_FLOORS.hardBytes).toBeLessThan(DISK_FLOORS.softBytes);
    expect(DISK_FLOORS.softBytes).toBeLessThanOrEqual(DISK_FLOORS.startMinBytes);
  });

  it('accepts floors passed in', () => {
    const floors = { startMinBytes: 100, softBytes: 50, hardBytes: 10 };
    expect(assessDisk(99, 'start', floors)).toBe('refuse');
    expect(assessDisk(40, 'recording', floors)).toBe('warn');
    expect(assessDisk(9, 'recording', floors)).toBe('stop');
  });
});

describe('formatBytes', () => {
  it('writes space in plain words', () => {
    expect(formatBytes(1.4 * GB)).toBe('1.4 GB');
    expect(formatBytes(320 * MB)).toBe('320 MB');
    expect(formatBytes(-5)).toBe('0 MB');
  });
});
