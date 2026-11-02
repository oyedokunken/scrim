import type { Scene } from '@/lib/demo/master';
import styles from './scene-screens.module.css';

/**
 * The app screens of the hero video, drawn as HTML and CSS. Each one reads its progress from the
 * `--p-<scene>` variable that the one clock writes, so it plays, pauses and scrubs with the rest.
 */
export function SceneScreen({ scene }: { scene: Scene }) {
  return <div className={styles.screen} data-scene-screen={scene} />;
}
