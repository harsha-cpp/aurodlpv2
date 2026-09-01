import type { CSSProperties } from "react";

type Props = {
  width: number;
  height: number;
  stroke?: number;
  gap?: number;
  color: string;
  className?: string;
  style?: CSSProperties;
};

export default function Bars({
  width,
  height,
  stroke = 1,
  gap = 10,
  color,
  className,
  style,
}: Props) {
  const pitch = stroke + gap;
  const count = Math.floor(width / pitch);
  const offset = (width - (count * pitch - gap)) / 2;
  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: offset + i * pitch,
            top: 0,
            width: stroke,
            height: "100%",
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
}
