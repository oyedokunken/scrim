import { Bug, Mail, ShieldAlert } from 'lucide-react';
import { siteConfig } from '@/site.config';
import { SiteLink } from '../site-link';
import styles from './contact.module.css';

/** The ways to reach the owner. Each has its own icon, and an outside link gets one arrow from SiteLink. */
const CHANNELS = [
  {
    icon: Mail,
    label: siteConfig.contactEmailLabel,
    href: `mailto:${siteConfig.contactInbox}`,
  },
  { icon: Bug, label: 'Open an issue on GitHub', href: siteConfig.issuesUrl },
  { icon: ShieldAlert, label: 'Report a security problem privately', href: siteConfig.securityUrl },
] as const;

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
          Questions, bug reports or ideas for Scrim? Open an issue on GitHub so others can follow
          along, or write an email.
        </p>
      </div>

      <div className={styles.channels}>
        <ul>
          {CHANNELS.map(({ icon: Icon, label, href }) => (
            <li key={href}>
              <SiteLink href={href}>
                <Icon aria-hidden="true" size={20} className={styles.channelIcon} />
                <span>{label}</span>
              </SiteLink>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
