import { ExternalLink, Globe } from 'lucide-react';
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Glyph, GITHUB, LINKEDIN } from './brand-glyphs';
import './built-by.css';

/** Where to find the builder. The same three places as the website's card, in the same order. */
const BUILT_BY_LINKS: readonly {
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
