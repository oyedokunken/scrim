import { ArrowUpRight, Mail } from 'lucide-react';
import { siteConfig } from '@/site.config';
import { SiteLink } from '../site-link';
import styles from './contact.module.css';

export function Contact() {
  return (
    <section
      id="contact"
      aria-labelledby="contact-title"
      className={`section deferred container ${styles.contact}`}
    >
      <div>
        <h2 id="contact-title" className="section-title">
          Get in touch
        </h2>
        <p className="lead">
          Questions, bug reports or ideas for Scrim? Write to us, or open an issue on GitHub so
          others can follow along.
        </p>
      </div>

      <div className={styles.channels}>
        <a className={styles.email} href={`mailto:${siteConfig.contactInbox}`}>
          <Mail aria-hidden="true" size={26} />
          {siteConfig.contactEmail}
        </a>
        <ul>
          <li>
            <SiteLink href={siteConfig.issuesUrl}>
              Open an issue on GitHub
              <ArrowUpRight aria-hidden="true" size={18} />
            </SiteLink>
          </li>
          <li>
            <SiteLink href={siteConfig.securityUrl}>
              Report a security problem privately
              <ArrowUpRight aria-hidden="true" size={18} />
            </SiteLink>
          </li>
        </ul>
      </div>
    </section>
  );
}
