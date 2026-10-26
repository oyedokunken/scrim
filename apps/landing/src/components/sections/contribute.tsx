import {
  ArrowUpRight,
  BookOpen,
  CircleDot,
  GitBranch,
  Sprout,
  type LucideIcon,
} from 'lucide-react';
import { siteConfig } from '@/site.config';
import styles from './contribute.module.css';
import { RunCommands } from './run-commands';

const LINKS: readonly { icon: LucideIcon; label: string; href: string }[] = [
  { icon: GitBranch, label: 'Repository', href: siteConfig.repoUrl },
  { icon: BookOpen, label: 'Contributing guide', href: siteConfig.contributingUrl },
  { icon: CircleDot, label: 'Open issues', href: siteConfig.issuesUrl },
  { icon: Sprout, label: 'Good first issues', href: siteConfig.goodFirstIssuesUrl },
];

export function Contribute() {
  return (
    <section
      id="contribute"
      aria-labelledby="contribute-title"
      className={`section deferred container ${styles.contribute}`}
    >
      <div className={styles.copyColumn}>
        <h2 id="contribute-title" className="section-title">
          Help build Scrim
        </h2>
        <p className="lead">
          Scrim is open source and built in public. Run the app on your own computer, pick a good
          first issue, or tell us what a screen recorder should do better.
        </p>
        <ul className={styles.links}>
          {LINKS.map(({ icon: Icon, label, href }) => (
            <li key={href}>
              <a href={href}>
                <Icon aria-hidden="true" size={22} className={styles.linkIcon} />
                <span>{label}</span>
                <ArrowUpRight aria-hidden="true" size={20} className={styles.linkArrow} />
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.workColumn}>
        <h3>Run it locally</h3>
        <p>Clone the repository, install its packages and start the app.</p>
        <RunCommands />
      </div>
    </section>
  );
}
