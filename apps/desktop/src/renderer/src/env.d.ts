/// <reference types="vite/client" />
import type { ScrimApi } from '../../shared/scrim-api';

declare global {
  interface Window {
    /** The typed bridge from the preload script. */
    scrim: ScrimApi;
  }
}
