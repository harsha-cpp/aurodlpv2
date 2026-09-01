type IconProps = {
  size?: number;
};

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: "false" as const,
};

export function ChevronsUpDown({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="m7 15 5 5 5-5" />
      <path d="m7 9 5-5 5 5" />
    </svg>
  );
}

export function DownloadIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

export function SearchIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function MonitorIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

export function SunIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

export function MoonIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CloseIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function BladeWordmark({ height = 30 }: { height?: number }) {
  const width = (height * 160.0) / 43.0;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 160 43"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Blade"
    >
      <g transform="translate(0 4.50) scale(0.43590)">
        <path
          d="M37.4 5.98Q26.65 25.49 9 45Q24.96 59.09 37.4 73.17Z"
          fill="currentColor"
        />
        <path
          d="M40.6 5.98Q51.35 25.49 69 45Q53.04 59.09 40.6 73.17Z"
          fill="var(--bd-accent)"
        />
      </g>
      <g
        fill="currentColor"
        transform="translate(39.00 32.00) scale(0.03000 -0.03000)"
      >
        <g transform="translate(0 0.00)">
          <path
            d="M0 700V0H582V417H461L363 700ZM144 283H438V134H144ZM144 566H267L317 417H144Z"
            transform="translate(0.00 0)"
          />
          <path d="M0 700V0H499V134H143V700Z" transform="translate(668.00 0)" />
          <path
            d="M144 700 0 283V0H144V193H436V0H580V283L436 700ZM242 566H339L421 327H160Z"
            transform="translate(1253.00 0)"
          />
          <path
            d="M0 699V0H482L580 283L436 699ZM143 566H339L436 283L385 134H143Z"
            transform="translate(1919.00 0)"
          />
          <path
            d="M0 700V0H560V134H143V283H363V417H143V566H560V700Z"
            transform="translate(2585.00 0)"
          />
        </g>
      </g>
    </svg>
  );
}
