import { siteConfig } from '@/site.config';
import { HeaderDownload } from './header-download';
import { HeaderScrollState } from './header-scroll-state';
import { Logo } from './logo';
import { MaltLink } from './malt-link';
import { MobileMenu } from './mobile-menu';
import styles from './site-header.module.css';

/**
 * The floating pill at the top of every page. It shrinks once the page scrolls. It always holds a
 * Download button. Wide screens add the links, and narrow screens add a menu whose last item is
 * Support.
 */
export function SiteHeader() {
  return (
    <header className={styles.wrap}>
      <HeaderScrollState />
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
        <HeaderDownload className={styles.download} />
        <MobileMenu items={siteConfig.nav}>
          <MaltLink className={styles.menuMalt} />
        </MobileMenu>
      </div>
    </header>
  );
}
