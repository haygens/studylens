/**
 * P21: the three room scenes, small inline SVGs (decorative: aria-hidden). All three are in the
 * page and CSS shows the one for the current look, so the right scene shows before any script
 * runs. Colours come from the look tokens (--lk-scene-*); the flames, steam and rain animate in
 * CSS only, and not at all under prefers-reduced-motion.
 */

/** Hearth: a brick fireplace arch with logs and two layers of flickering flames. */
function HearthScene() {
  const bricks = [];
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 10; col++) {
      const x = col * 40 + (row % 2 ? 20 : 0);
      bricks.push(
        <rect key={`${row}-${col}`} x={x + 1} y={row * 30 + 1} width={38} height={28} rx={3} />,
      );
    }
  }
  return (
    <svg
      className="scene-svg"
      viewBox="0 0 360 240"
      preserveAspectRatio="xMidYMax slice"
      focusable="false"
    >
      <g className="hearth-bricks">{bricks}</g>
      <path className="hearth-arch" d="M90 240 V140 A90 90 0 0 1 270 140 V240 Z" />
      <g className="hearth-flames flames-a">
        <path
          className="flame-outer"
          d="M180 222 C150 205 150 170 168 140 C170 160 178 165 182 150 C190 130 186 115 194 100 C214 135 222 170 208 200 C202 214 192 220 180 222 Z"
        />
        <path
          className="flame-outer"
          d="M140 224 C122 212 124 190 136 172 C140 186 146 188 150 178 C162 196 160 214 140 224 Z"
        />
        <path
          className="flame-outer"
          d="M222 224 C206 214 206 194 216 178 C220 190 226 190 228 182 C242 198 240 216 222 224 Z"
        />
      </g>
      <g className="hearth-flames flames-b">
        <path
          className="flame-inner"
          d="M182 222 C164 212 164 190 174 172 C178 184 184 184 186 172 C200 186 202 210 182 222 Z"
        />
        <path
          className="flame-inner"
          d="M146 224 C136 218 136 206 142 196 C146 204 150 204 152 198 C158 208 156 218 146 224 Z"
        />
        <path
          className="flame-inner"
          d="M220 224 C210 218 210 206 216 198 C220 206 224 204 224 200 C232 210 230 220 220 224 Z"
        />
      </g>
      <ellipse className="hearth-embers" cx="180" cy="226" rx="70" ry="8" />
      <rect
        className="hearth-log"
        x="118"
        y="220"
        width="124"
        height="14"
        rx="7"
        transform="rotate(-4 180 227)"
      />
      <rect
        className="hearth-log"
        x="124"
        y="222"
        width="116"
        height="13"
        rx="6.5"
        transform="rotate(5 180 228)"
      />
      <rect className="hearth-hearthstone" x="60" y="234" width="240" height="6" rx="2" />
    </svg>
  );
}

/** Corner Café: a little table with three mugs; steam rises from two of them. */
function CafeScene() {
  const mug = (x: number, cls: string, steam: boolean) => (
    <g key={x}>
      {steam && (
        <g className="cafe-steam">
          <path
            className={`steam steam-${x % 2 ? 'a' : 'b'}`}
            d={`M${x + 14} 52 c-6 -8 6 -12 0 -20 c-6 -8 6 -12 0 -20`}
          />
          <path
            className={`steam steam-${x % 2 ? 'b' : 'a'}`}
            d={`M${x + 26} 52 c-6 -8 6 -12 0 -20 c-6 -8 6 -12 0 -20`}
          />
        </g>
      )}
      <path className="cafe-handle" d={`M${x + 40} 64 h6 a8 8 0 0 1 0 16 h-6`} />
      <rect className={cls} x={x} y={56} width={40} height={36} rx={7} />
      <ellipse className="cafe-coffee" cx={x + 20} cy={59} rx={16} ry={3.5} />
    </g>
  );
  return (
    <svg
      className="scene-svg"
      viewBox="0 0 360 120"
      preserveAspectRatio="xMidYMax meet"
      focusable="false"
    >
      {mug(92, 'mug-1', true)}
      {mug(160, 'mug-2', false)}
      {mug(228, 'mug-3', true)}
      <rect className="cafe-table" x="40" y="92" width="280" height="12" rx="4" />
      <rect className="cafe-leg" x="170" y="104" width="20" height="16" />
    </svg>
  );
}

/** Rainy Window: moon and hills through a four-pane window, three staggered groups of rain. */
function RainyScene() {
  const streaks = (offset: number) =>
    Array.from({ length: 9 }, (_, i) => {
      const x = 10 + i * 40 + offset;
      const y = ((i * 53 + offset * 7) % 150) + 10;
      return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 18} />;
    });
  return (
    <svg
      className="scene-svg"
      viewBox="0 0 360 180"
      preserveAspectRatio="xMidYMid slice"
      focusable="false"
    >
      <rect className="rainy-sky" width="360" height="180" />
      <circle className="rainy-moon" cx="270" cy="48" r="22" />
      <path
        className="rainy-hills-far"
        d="M0 140 C60 110 120 118 180 132 C240 146 300 112 360 120 V180 H0 Z"
      />
      <path
        className="rainy-hills"
        d="M0 158 C70 140 130 150 190 160 C250 170 310 146 360 150 V180 H0 Z"
      />
      <g className="rain rain-1">{streaks(0)}</g>
      <g className="rain rain-2">{streaks(14)}</g>
      <g className="rain rain-3">{streaks(27)}</g>
      <rect className="rainy-muntin" x="176" y="0" width="8" height="180" />
      <rect className="rainy-muntin" x="0" y="86" width="360" height="8" />
    </svg>
  );
}

export function RoomScenes() {
  return (
    <div className="room-scene" aria-hidden="true">
      <div className="scene scene-hearth">
        <HearthScene />
      </div>
      <div className="scene scene-cafe">
        <CafeScene />
      </div>
      <div className="scene scene-rainy">
        <RainyScene />
      </div>
    </div>
  );
}
