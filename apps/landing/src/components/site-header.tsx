import { siteConfig } from '@/site.config';
import { HeaderDownload } from './header-download';
import { HeaderScrollState } from './header-scroll-state';
import { Logo } from './logo';
import { MaltLink } from './malt-link';
import { MobileMenu } from './mobile-menu';
import styles from './site-header.module.css';

/**
 * The floating pill at the top of every page. It shrinks once the page scrolls. On wide screens it
 * holds the links and the Buy me malt link. On narrow screens it holds a Download link and a menu,
 * and Buy me malt is the last item in the menu.
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
        <MaltLink className={styles.malt} />
        <HeaderDownload className={styles.download} />
        <MobileMenu items={siteConfig.nav}>
          <MaltLink className={styles.menuMalt} />
        </MobileMenu>
      </div>
    </header>
  );
}
