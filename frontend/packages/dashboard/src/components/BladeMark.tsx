import type { CSSProperties } from "react";

type Props = {
  size?: number;
  color?: string;
  accentColor?: string;
  className?: string;
  style?: CSSProperties;
};

export default function BladeMark({
  size = 20,
  color = "currentColor",
  accentColor,
  className,
  style,
}: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 78 78"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      <path
        d="M37.4 5.98Q26.65 25.49 9 45Q24.96 59.09 37.4 73.17Z"
        fill={color}
      />
      <path
        d="M40.6 5.98Q51.35 25.49 69 45Q53.04 59.09 40.6 73.17Z"
        fill={accentColor ?? color}
      />
    </svg>
  );
}
