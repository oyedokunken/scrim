import { describe, expect, it } from 'vitest';
import { formatBytes, formatSeconds, formatTimer } from '../../src/renderer/src/format';
import { routeFromHash } from '../../src/renderer/src/routes';

describe('formatTimer', () => {
  it.each([
    [0, '00:00'],
    [999, '00:00'],
    [1000, '00:01'],
    [7400, '00:07'],
    [59_999, '00:59'],
    [60_000, '01:00'],
    [754_000, '12:34'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [3_725_000, '1:02:05'],
    [-5000, '00:00'],
  ])('%i ms is %s', (ms, expected) => {
    expect(formatTimer(ms)).toBe(expected);
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [4096, '4.0 KB'],
    [1_048_576, '1.0 MB'],
    [250 * 1024 * 1024, '250 MB'],
    [1_610_612_736, '1.5 GB'],
    [5 * 1024 ** 4, '5.0 TB'],
    [5000 * 1024 ** 4, '5000 TB'],
  ])('%i bytes is %s', (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });
});

describe('formatSeconds', () => {
  it.each([
    [200, '0.2 s'],
    [1200, '1.2 s'],
    [5000, '5.0 s'],
  ])('%i ms is %s', (ms, expected) => {
    expect(formatSeconds(ms)).toBe(expected);
  });
});

describe('routeFromHash', () => {
  it.each([
    ['#/control', 'control'],
    ['', 'main'],
    ['#', 'main'],
    ['#/', 'main'],
    ['#/controlx', 'main'],
    ['#/Control', 'main'],
    ['#/home', 'main'],
  ])('%j is the %s screen', (hash, expected) => {
    expect(routeFromHash(hash)).toBe(expected);
  });
});
