import type { CSSProperties } from "react";

type Props = {
  height?: number;
  className?: string;
  style?: CSSProperties;
};

export default function BladeWordmark({
  height = 30,
  className,
  style,
}: Props) {
  const width = (height * 134.0) / 43.0;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 134 43"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
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
          fill="var(--accent)"
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
