import type { EditorProject } from './editor-api';

/**
 * Where the page plays each track from. This is the one place that knows, so the app can change
 * how media reaches the page (a protocol, or blobs) without touching the editor. The addresses
 * come from the project the app opened.
 */
export function mediaSources(project: EditorProject): EditorProject['media'] {
  return project.media;
}
