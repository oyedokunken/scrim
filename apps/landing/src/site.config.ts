/** The one place for names, links and copy that appears in more than one spot. */
export const siteConfig = {
  name: 'Scrim',
  tagline: 'Screen capture that stays on your computer.',
  description:
    'Scrim is a free, open source screen recorder and screenshot tool for Windows, macOS and Linux. It highlights the cursor, ripples every click, zooms in where you work and exports an MP4 that plays everywhere.',
  repoUrl: 'https://github.com/oyedokunken/scrim',
  releasesUrl: 'https://github.com/oyedokunken/scrim/releases',
  issuesUrl: 'https://github.com/oyedokunken/scrim/issues',
  goodFirstIssuesUrl:
    'https://github.com/oyedokunken/scrim/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22',
  contributingUrl: 'https://github.com/oyedokunken/scrim/blob/main/CONTRIBUTING.md',
  securityUrl: 'https://github.com/oyedokunken/scrim/blob/main/SECURITY.md',
  licenseUrl: 'https://github.com/oyedokunken/scrim/blob/main/LICENSE',
  changelogUrl: 'https://github.com/oyedokunken/scrim/blob/main/CHANGELOG.md',
  suyaUrl: 'https://buymeamalt.com/@oyedokunken',
  contactEmail: 'oyedokunken@gmail.com',
  author: {
    name: 'Oyedokun Kehinde',
    url: 'https://www.oyedokun.dev/',
  },
  nav: [
    { label: 'Features', href: '#features' },
    { label: 'Who it’s for', href: '#who' },
    { label: 'Download', href: '#download' },
    { label: 'About', href: '#about' },
    { label: 'Contribute', href: '#contribute' },
  ],
  footerLinks: {
    Product: [
      { label: 'Features', href: '/#features' },
      { label: 'Download', href: '/#download' },
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

export type SiteConfig = typeof siteConfig;
