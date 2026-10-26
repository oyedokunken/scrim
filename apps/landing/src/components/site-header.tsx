import { siteConfig } from '@/site.config';
import { Logo } from './logo';
import { MobileMenu } from './mobile-menu';
import styles from './site-header.module.css';
import { SuyaLink } from './suya-link';

/** The floating pill at the top of every page. */
export function SiteHeader() {
  return (
    <header className={styles.wrap}>
      <div className={styles.pill}>
        <a href="/" className={styles.logo} aria-label={`${siteConfig.name} home`}>
          <Logo markSize={28} />
        </a>
        <nav aria-label="Primary" className={styles.nav}>
          <ul>
            {siteConfig.nav.map((item) => (
              <li key={item.href}>
                <a href={`/${item.href}`}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <SuyaLink className={styles.suya} />
        <MobileMenu items={siteConfig.nav} />
      </div>
    </header>
  );
}
