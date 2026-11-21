/**
 * Small inline SVG icons (P13b). Decorative: they always sit next to a text label, so they are
 * hidden from screen readers. `currentColor` makes them follow the text color of the theme.
 */
import type { ReactNode } from 'react';

function Svg({ children, viewBox = '0 0 16 16' }: { children: ReactNode; viewBox?: string }) {
  return (
    <svg className="sl-icon" viewBox={viewBox} aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const BookIcon = () => (
  <Svg>
    <path
      d="M2 3.2C3.6 2.4 5.6 2.4 8 3.6c2.4-1.2 4.4-1.2 6-.4v9.6c-1.6-.8-3.6-.8-6 .4-2.4-1.2-4.4-1.2-6-.4z"
      {...stroke}
    />
    <path d="M8 3.6v9.6" {...stroke} />
  </Svg>
);

export const DotIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="5.2" {...stroke} />
    <circle cx="8" cy="8" r="1.8" fill="currentColor" />
  </Svg>
);

export const BoltIcon = () => (
  <Svg>
    <path d="M9.2 1.5 3.5 9h4l-1 5.5L12.5 7h-4z" fill="currentColor" />
  </Svg>
);

export const CheckIcon = () => (
  <Svg>
    <path d="M3 8.5 6.5 12 13 4.5" {...stroke} strokeWidth={2} />
  </Svg>
);

export const HalfIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="5.5" {...stroke} />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
  </Svg>
);

export const CrossIcon = () => (
  <Svg>
    <path d="M4 4l8 8M12 4l-8 8" {...stroke} strokeWidth={2} />
  </Svg>
);

export const PauseIcon = () => (
  <Svg>
    <rect x="4" y="3" width="2.6" height="10" rx="1" fill="currentColor" />
    <rect x="9.4" y="3" width="2.6" height="10" rx="1" fill="currentColor" />
  </Svg>
);

export const ShieldIcon = () => (
  <Svg>
    <path d="M8 1.5 13 3.5v4c0 3.2-2.2 5.6-5 7-2.8-1.4-5-3.8-5-7v-4z" {...stroke} />
  </Svg>
);

export const InfoIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="6.2" {...stroke} />
    <path d="M8 7.2v4" {...stroke} strokeWidth={1.8} />
    <circle cx="8" cy="4.9" r="1" fill="currentColor" />
  </Svg>
);

export const BackIcon = () => (
  <Svg>
    <path d="M7 3 2.5 8 7 13M3 8h10.5" {...stroke} strokeWidth={1.8} />
  </Svg>
);

export const SparkleIcon = () => (
  <Svg>
    <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6z" fill="currentColor" />
  </Svg>
);

export const ChatIcon = () => (
  <Svg>
    <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" {...stroke} />
  </Svg>
);
