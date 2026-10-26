/** The one place for names, links and copy that appears in more than one spot. */
export const siteConfig = {
  name: 'Scrim',
  tagline: 'Record anything on your screen effortlessly',
  description:
    'Scrim is a free, open source screen recorder for Windows, macOS and Linux. It spotlights your cursor, ripples every click, zooms in on the action and exports a clean MP4. Everything stays on your computer.',
  repoUrl: 'https://github.com/oyedokunken/scrim',
  releasesUrl: 'https://github.com/oyedokunken/scrim/releases',
  issuesUrl: 'https://github.com/oyedokunken/scrim/issues',
  goodFirstIssuesUrl:
    'https://github.com/oyedokunken/scrim/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22',
  contributingUrl: 'https://github.com/oyedokunken/scrim/blob/main/CONTRIBUTING.md',
  securityUrl: 'https://github.com/oyedokunken/scrim/blob/main/SECURITY.md',
  licenseUrl: 'https://github.com/oyedokunken/scrim/blob/main/LICENSE',
  changelogUrl: 'https://github.com/oyedokunken/scrim/blob/main/CHANGELOG.md',
  maltUrl: 'https://buymeamalt.com/@oyedokunken',
  /** The address people see. */
  contactEmail: 'hello@scrim.app',
  /** Where mail to that address goes. Links open a message to this inbox. */
  contactInbox: 'oyedokunken@gmail.com',
  author: {
    name: 'Oyedokun Kehinde',
    handle: '@oyedokunken',
    url: 'https://www.oyedokun.dev/',
  },
  /** Where to find the person who builds Scrim, in the order the footer shows them. */
  socials: [
    { id: 'website', name: 'Website', href: 'https://www.oyedokun.dev/' },
    { id: 'github', name: 'GitHub', href: 'https://github.com/oyedokunken/' },
    { id: 'linkedin', name: 'LinkedIn', href: 'https://www.linkedin.com/in/oyedokunken' },
    { id: 'instagram', name: 'Instagram', href: 'https://www.instagram.com/oyedokunken/' },
    { id: 'x', name: 'X', href: 'https://x.com/oyedokunken_' },
  ],
  nav: [
    { label: 'Features', href: '#features' },
    { label: 'Use cases', href: '#use-cases' },
    { label: 'Download', href: '#download' },
    { label: 'FAQ', href: '#faq' },
    { label: 'Contribute', href: '#contribute' },
  ],
  footerLinks: {
    Product: [
      { label: 'Features', href: '/#features' },
      { label: 'Use cases', href: '/#use-cases' },
      { label: 'Download', href: '/#download' },
      { label: 'FAQ', href: '/#faq' },
      { label: 'Release notes', href: 'https://github.com/oyedokunken/scrim/releases' },
    ],
    Project: [
      { label: 'Source code', href: 'https://github.com/oyedokunken/scrim' },
      { label: 'Report an issue', href: 'https://github.com/oyedokunken/scrim/issues' },
      { label: 'Contribute', href: '/#contribute' },
      { label: 'Contact', href: '/#contact' },
    ],
    Trust: [
      { label: 'Privacy policy', href: '/privacy' },
      { label: 'MIT license', href: 'https://github.com/oyedokunken/scrim/blob/main/LICENSE' },
      {
        label: 'Security policy',
        href: 'https://github.com/oyedokunken/scrim/blob/main/SECURITY.md',
      },
    ],
  },
} as const;
