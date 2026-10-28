import { ExternalLink, Globe } from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import './built-by.css';

const GITHUB =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';
const LINKEDIN =
  'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z';

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Where to find the builder. The same three places as the website's card, in the same order. */
export const BUILT_BY_LINKS: readonly {
  id: string;
  name: string;
  href: string;
  icon: ReactNode;
}[] = [
  {
    id: 'website',
    name: 'Website',
    href: 'https://www.oyedokun.dev/',
    icon: <Globe aria-hidden="true" size={22} strokeWidth={2} />,
  },
  {
    id: 'github',
    name: 'GitHub',
    href: 'https://github.com/oyedokunken',
    icon: <Glyph d={GITHUB} />,
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    href: 'https://www.linkedin.com/in/oyedokunken',
    icon: <Glyph d={LINKEDIN} />,
  },
];

const HOVER_CLOSE_MS = 180;

/** One icon with a green tooltip that names where it goes. It shows on hover and on keyboard focus. */
function IconLink({
  name,
  href,
  onOpen,
  children,
}: {
  name: string;
  href: string;
  onOpen: (url: string) => void;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const visible = (hovered || focused) && !dismissed;
  const go = (event: MouseEvent): void => {
    event.preventDefault();
    onOpen(href);
  };
  return (
    <a
      href={href}
      className="built-by-link"
      aria-label={`${name} (opens in your browser)`}
      onClick={go}
      onPointerEnter={() => {
        setDismissed(false);
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
      }}
      onFocus={() => {
        setDismissed(false);
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible) setDismissed(true);
      }}
    >
      {children}
      <span className="built-by-tip" data-visible={visible ? 'true' : 'false'} aria-hidden="true">
        {name}
        <ExternalLink size={14} strokeWidth={2.5} />
      </span>
    </a>
  );
}

/**
 * "Built by @oyedokunken", the same card as the website's footer: the handle opens a small white
 * card with round icon buttons for the builder's website, GitHub and LinkedIn, each with a green
 * tooltip. It opens on hover, on click and on keyboard focus, and closes on Escape, on a click
 * outside it and when focus leaves it. Escape returns focus to the handle.
 */
export function BuiltBy({ onOpenLink }: { onOpenLink: (url: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Set while Escape puts focus back on the handle, so that focus does not open the card again. */
  const returningFocus = useRef(false);
  const panelId = useId();
  const open = hovered || pinned || focused;

  useEffect(() => {
    if (!open) return;
    const outside = (target: EventTarget | null): boolean =>
      root.current !== null && target instanceof Node && !root.current.contains(target);
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setHovered(false);
      setPinned(false);
      setFocused(false);
      returningFocus.current = true;
      button.current?.focus({ preventScroll: true });
      returningFocus.current = false;
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (outside(event.target)) {
        setPinned(false);
        setFocused(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(
    () => () => {
      if (closeTimer.current !== undefined) clearTimeout(closeTimer.current);
    },
    [],
  );

  const enter = (): void => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const leave = (): void => {
    if (closeTimer.current !== undefined) clearTimeout(closeTimer.current);
    // A short grace so the pointer can cross the gap between the handle and the card.
    closeTimer.current = setTimeout(() => {
      setHovered(false);
    }, HOVER_CLOSE_MS);
  };

  return (
    <span
      ref={root}
      className="built-by"
      onPointerEnter={enter}
      onPointerLeave={leave}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      Built by{' '}
      <button
        ref={button}
        type="button"
        className="built-by-handle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setPinned((current) => !current);
        }}
        onFocus={(event) => {
          // Focus from the keyboard opens the card. A click focuses too, and it pins instead.
          if (!returningFocus.current && event.currentTarget.matches(':focus-visible')) {
            setFocused(true);
          }
        }}
      >
        @oyedokunken
      </button>
      <div
        id={panelId}
        className="built-by-panel"
        role="group"
        aria-label="Find @oyedokunken online"
        hidden={!open}
        onFocus={() => {
          setFocused(true);
        }}
      >
        <ul className="built-by-icons">
          {BUILT_BY_LINKS.map((link) => (
            <li key={link.id}>
              <IconLink name={link.name} href={link.href} onOpen={onOpenLink}>
                {link.icon}
              </IconLink>
            </li>
          ))}
        </ul>
      </div>
    </span>
  );
}
