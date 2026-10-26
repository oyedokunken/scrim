import { DEMO_FRAME } from '@/lib/demo/script';

const SIDEBAR = ['Inbox', 'Today', 'Upcoming', 'Projects', 'Archive'] as const;

const TASKS = [
  { title: 'Review the launch checklist', tag: 'Today' },
  { title: 'Reply to the design feedback', tag: 'Team' },
  { title: 'Update the release notes', tag: 'Docs' },
  { title: 'Book the review meeting', tag: 'Later' },
] as const;

const ROW_TOP = 250;
const ROW_STEP = 88;

/**
 * A pretend task app, drawn at 1280 by 720 so the scripted cursor path lines up with it. The
 * clicks land on the Filter button, on the second task and on the Save button.
 */
export function MockWindow() {
  const { width, height } = DEMO_FRAME;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      width={width}
      height={height}
      focusable="false"
      aria-hidden="true"
    >
      <g fontFamily="var(--font-sans)">
        <rect width={width} height={height} fill="var(--scrim-white)" />

        {/* Title bar */}
        <rect width={width} height="56" fill="var(--scrim-fill-quiet-on-white)" />
        {[28, 52, 76].map((x) => (
          <circle key={x} cx={x} cy="28" r="7" fill="var(--scrim-border-on-white)" />
        ))}
        <rect x="116" y="12" width="176" height="32" rx="16" fill="var(--scrim-white)" />
        <text
          x="204"
          y="34"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill="var(--scrim-black)"
        >
          Team tasks
        </text>

        {/* Toolbar */}
        <rect y="56" width={width} height="64" fill="var(--scrim-white)" />
        <path d="M0 120H1280" stroke="var(--scrim-border-on-white)" strokeWidth="2" />
        <rect
          x="282"
          y="68"
          width="96"
          height="40"
          rx="20"
          fill="var(--scrim-fill-quiet-on-white)"
        />
        <text
          x="330"
          y="94"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="var(--scrim-black)"
        >
          Filter
        </text>
        <rect
          x="394"
          y="68"
          width="84"
          height="40"
          rx="20"
          fill="var(--scrim-fill-quiet-on-white)"
        />
        <text
          x="436"
          y="94"
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="var(--scrim-black)"
        >
          Sort
        </text>
        <rect
          x="900"
          y="68"
          width="340"
          height="40"
          rx="20"
          fill="var(--scrim-fill-quiet-on-white)"
        />
        <text x="928" y="94" fontSize="18" fontWeight="600" fill="var(--scrim-text-secondary)">
          Search tasks
        </text>

        {/* Sidebar */}
        <rect y="120" width="260" height={height - 120} fill="var(--scrim-fill-quiet-on-white)" />
        {SIDEBAR.map((label, index) => (
          <g key={label}>
            {index === 1 ? (
              <rect
                x="20"
                y={151 + index * 56}
                width="220"
                height="44"
                rx="12"
                fill="var(--scrim-green-tint)"
              />
            ) : null}
            <text
              x="44"
              y={180 + index * 56}
              fontSize="20"
              fontWeight={index === 1 ? 800 : 600}
              fill={index === 1 ? 'var(--scrim-green)' : 'var(--scrim-black)'}
            >
              {label}
            </text>
          </g>
        ))}

        {/* Content */}
        <text
          x="320"
          y="204"
          fontSize="48"
          fontWeight="800"
          letterSpacing="-1.2"
          fill="var(--scrim-black)"
        >
          Team tasks
        </text>
        {TASKS.map((task, index) => {
          const top = ROW_TOP + index * ROW_STEP;
          return (
            <g key={task.title}>
              <rect
                x="320"
                y={top}
                width="910"
                height="72"
                rx="16"
                fill="var(--scrim-white)"
                stroke="var(--scrim-border-on-white)"
                strokeWidth="2"
              />
              <circle
                cx="360"
                cy={top + 36}
                r="13"
                fill={index === 1 ? 'var(--scrim-green)' : 'none'}
                stroke={index === 1 ? 'var(--scrim-green)' : 'var(--scrim-border-on-white)'}
                strokeWidth="3"
              />
              <text x="394" y={top + 44} fontSize="22" fontWeight="700" fill="var(--scrim-black)">
                {task.title}
              </text>
              <rect
                x="1096"
                y={top + 20}
                width="104"
                height="32"
                rx="16"
                fill="var(--scrim-fill-quiet-on-white)"
              />
              <text
                x="1148"
                y={top + 42}
                textAnchor="middle"
                fontSize="16"
                fontWeight="700"
                fill="var(--scrim-text-secondary)"
              >
                {task.tag}
              </text>
            </g>
          );
        })}

        {/* Save button */}
        <rect x="1010" y="616" width="220" height="64" rx="32" fill="var(--scrim-green)" />
        <text
          x="1120"
          y="657"
          textAnchor="middle"
          fontSize="22"
          fontWeight="800"
          fill="var(--scrim-butter)"
        >
          Save changes
        </text>
      </g>
    </svg>
  );
}
