import type { CSSProperties } from 'react';
import { DEMO_FRAME } from '@/lib/demo/script';

const SIDEBAR = ['Inbox', 'Today', 'Upcoming', 'Projects', 'Archive'] as const;

const TASKS = [
  { title: 'Review the launch checklist', tag: 'Today' },
  { title: 'Reply to the design feedback', tag: 'Team' },
  { title: 'Update the release notes', tag: 'Docs' },
  { title: 'Book the review meeting', tag: 'Later' },
] as const;

const PEOPLE = [
  { initial: 'A', tint: 'var(--scrim-green)', ink: 'var(--scrim-butter)' },
  { initial: 'M', tint: 'var(--scrim-green-tint)', ink: 'var(--scrim-green)' },
  { initial: 'K', tint: 'var(--scrim-black)', ink: 'var(--scrim-butter)' },
] as const;

const MENU_ITEMS = ['All tasks', 'Due today', 'Assigned to me', 'Completed'] as const;

const ROW_TOP = 250;
const ROW_STEP = 88;

/** Opacity (and a small lift) driven by a CSS variable that the demo updates every frame. */
const fade = (name: string, lift = 0): CSSProperties => ({
  opacity: `var(${name})`,
  transform: lift === 0 ? undefined : `translateY(calc((1 - var(${name})) * ${String(lift)}px))`,
});

/** A task row that fades to its ticked state as a CSS variable goes from 0 to 1. */
function TickedRow({ index, variable }: { index: 1 | 2; variable: string }) {
  const top = ROW_TOP + index * ROW_STEP;
  const task = TASKS[index];
  return (
    <g style={fade(variable)}>
      <rect x="321" y={top + 1} width="908" height="70" rx="15" fill="var(--scrim-green-tint)" />
      <circle cx="360" cy={top + 36} r="14" fill="var(--scrim-green)" />
      <path
        d={`M352 ${String(top + 36)}l6 6l11 -12`}
        fill="none"
        stroke="var(--scrim-butter)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text x="394" y={top + 44} fontSize="22" fontWeight="700" fill="var(--scrim-text-secondary)">
        {task.title}
      </text>
      <rect
        x="394"
        y={top + 35}
        width="318"
        height="3"
        rx="1.5"
        fill="var(--scrim-text-secondary)"
      />
    </g>
  );
}

/**
 * A pretend task app, drawn at 1280 by 720 so the scripted cursor path lines up with it. The
 * clicks land on the Filter button, on the second task and on the Save button, and the app
 * answers each one: a menu opens, a task is ticked, a message says the changes were saved.
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

        {PEOPLE.map((person, index) => (
          <g key={person.initial}>
            <circle
              cx={1196 + index * 22}
              cy="28"
              r="15"
              fill={person.tint}
              stroke="var(--scrim-fill-quiet-on-white)"
              strokeWidth="3"
            />
            <text
              x={1196 + index * 22}
              y="33"
              textAnchor="middle"
              fontSize="13"
              fontWeight="800"
              fill={person.ink}
            >
              {person.initial}
            </text>
          </g>
        ))}

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
        <text
          x="928"
          y="94"
          fontSize="18"
          fontWeight="600"
          fill="var(--scrim-text-secondary)"
          style={{ opacity: 'calc(1 - var(--search))' }}
        >
          Search tasks
        </text>
        {/* The search box takes focus and a word is typed into it. */}
        <g style={fade('--search')}>
          <rect
            x="901"
            y="69"
            width="338"
            height="38"
            rx="19"
            fill="var(--scrim-white)"
            stroke="var(--scrim-green)"
            strokeWidth="3"
          />
          <text
            data-demo="typed"
            x="928"
            y="94"
            fontSize="18"
            fontWeight="700"
            fill="var(--scrim-black)"
          />
        </g>
        {/* A filter is applied after the menu choice, so the Filter button turns green. */}
        <g style={fade('--chip')}>
          <rect x="282" y="68" width="96" height="40" rx="20" fill="var(--scrim-green)" />
          <text
            x="330"
            y="94"
            textAnchor="middle"
            fontSize="18"
            fontWeight="700"
            fill="var(--scrim-white)"
          >
            Filter
          </text>
          <circle
            cx="374"
            cy="74"
            r="8"
            fill="var(--scrim-butter)"
            stroke="var(--scrim-green)"
            strokeWidth="3"
          />
        </g>

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

        {[
          { index: 0, count: '12' },
          { index: 1, count: '4' },
        ].map((badge) => (
          <g key={badge.count}>
            <rect
              x="190"
              y={158 + badge.index * 56}
              width="38"
              height="28"
              rx="14"
              fill={badge.index === 1 ? 'var(--scrim-green)' : 'var(--scrim-border-on-white)'}
            />
            <text
              x="209"
              y={178 + badge.index * 56}
              textAnchor="middle"
              fontSize="15"
              fontWeight="800"
              fill={badge.index === 1 ? 'var(--scrim-butter)' : 'var(--scrim-black)'}
            >
              {badge.count}
            </text>
          </g>
        ))}
        <path d="M20 624H240" stroke="var(--scrim-border-on-white)" strokeWidth="2" />
        <circle cx="46" cy="665" r="20" fill="var(--scrim-green)" />
        <text
          x="46"
          y="671"
          textAnchor="middle"
          fontSize="17"
          fontWeight="800"
          fill="var(--scrim-butter)"
        >
          A
        </text>
        <text x="80" y="659" fontSize="18" fontWeight="800" fill="var(--scrim-black)">
          Ada Lovelace
        </text>
        <text x="80" y="681" fontSize="15" fontWeight="600" fill="var(--scrim-text-secondary)">
          Product team
        </text>

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
        {/* Dashboard summary: three numbers and a progress bar. The Done count and the bar move
            as the tasks are ticked off. */}
        {[
          { x: 640, label: 'Open', value: '12' },
          { x: 840, label: 'Due today', value: '4' },
          { x: 1040, label: 'Done', value: null },
        ].map((stat) => (
          <g key={stat.label}>
            <rect
              x={stat.x}
              y="150"
              width="190"
              height="64"
              rx="16"
              fill="var(--scrim-white)"
              stroke="var(--scrim-border-on-white)"
              strokeWidth="2"
            />
            <text
              x={stat.x + 20}
              y="176"
              fontSize="15"
              fontWeight="700"
              fill="var(--scrim-text-secondary)"
            >
              {stat.label}
            </text>
            {stat.value === null ? (
              <>
                <text
                  x={stat.x + 20}
                  y="204"
                  fontSize="26"
                  fontWeight="800"
                  fill="var(--scrim-green)"
                  style={{ opacity: 'calc(1 - var(--checked))' }}
                >
                  28
                </text>
                <text
                  x={stat.x + 20}
                  y="204"
                  fontSize="26"
                  fontWeight="800"
                  fill="var(--scrim-green)"
                  style={{ opacity: 'calc(var(--checked) - var(--checkedMore))' }}
                >
                  29
                </text>
                <text
                  x={stat.x + 20}
                  y="204"
                  fontSize="26"
                  fontWeight="800"
                  fill="var(--scrim-green)"
                  style={{ opacity: 'var(--checkedMore)' }}
                >
                  30
                </text>
              </>
            ) : (
              <text
                x={stat.x + 20}
                y="204"
                fontSize="26"
                fontWeight="800"
                fill="var(--scrim-black)"
              >
                {stat.value}
              </text>
            )}
          </g>
        ))}
        <rect
          x="320"
          y="226"
          width="910"
          height="8"
          rx="4"
          fill="var(--scrim-fill-quiet-on-white)"
        />
        <rect
          x="320"
          y="226"
          width="910"
          height="8"
          rx="4"
          fill="var(--scrim-green)"
          style={{
            transformBox: 'fill-box',
            transformOrigin: 'left center',
            transform: 'scaleX(calc(0.62 + 0.05 * var(--checked) + 0.05 * var(--checkedMore)))',
          }}
        />

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
                fill="none"
                stroke="var(--scrim-border-on-white)"
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
              <circle cx="1068" cy={top + 36} r="15" fill={PEOPLE[index % 3]?.tint} />
              <text
                x="1068"
                y={top + 42}
                textAnchor="middle"
                fontSize="15"
                fontWeight="800"
                fill={PEOPLE[index % 3]?.ink}
              >
                {PEOPLE[index % 3]?.initial}
              </text>
            </g>
          );
        })}

        {/* Tasks get ticked off after their clicks. */}
        <TickedRow index={1} variable="--checked" />
        <TickedRow index={2} variable="--checkedMore" />

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

        {/* The filter menu opens after the first click. */}
        <g style={fade('--menu', 10)}>
          <rect
            x="278"
            y="120"
            width="236"
            height="196"
            rx="18"
            fill="var(--scrim-white)"
            stroke="var(--scrim-border-on-white)"
            strokeWidth="2"
          />
          <rect x="290" y="132" width="212" height="40" rx="10" fill="var(--scrim-green-tint)" />
          {MENU_ITEMS.map((item, index) => (
            <text
              key={item}
              x="310"
              y={158 + index * 44}
              fontSize="19"
              fontWeight={index === 0 ? 800 : 600}
              fill={index === 0 ? 'var(--scrim-green)' : 'var(--scrim-black)'}
            >
              {item}
            </text>
          ))}
        </g>

        {/* The saved message appears after the third click. */}
        <g style={fade('--toast', 14)}>
          <rect x="660" y="620" width="300" height="56" rx="28" fill="var(--scrim-black)" />
          <circle cx="694" cy="648" r="13" fill="var(--scrim-green)" />
          <path
            d="M687 648l5 5l9 -10"
            fill="none"
            stroke="var(--scrim-butter)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x="722" y="655" fontSize="20" fontWeight="700" fill="var(--scrim-butter)">
            Changes saved
          </text>
        </g>
      </g>
    </svg>
  );
}
