export const ALLOW_MARKER: string;
export const BANNED_PHRASES: string[];
export const SCANNED: string[];
export const SKIPPED: string[];
export function isScanned(file: string): boolean;
export function findCopyProblems(text: string): { line: number; phrase: string }[];
