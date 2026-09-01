"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import BladeMark from "./ui/BladeMark";

type Token = { key: number; kind: "mark" | "space" | "char"; value: string };

function tokenize(text: string): Token[][] {
  const words: Token[][] = [];
  let word: Token[] = [];
  let key = 0;
  const flush = () => {
    if (word.length) words.push(word);
    word = [];
  };
  const parts = text.split("{O}");
  parts.forEach((part, p) => {
    for (const ch of part) {
      if (ch === " ") {
        flush();
        words.push([{ key: key++, kind: "space", value: " " }]);
      } else {
        word.push({ key: key++, kind: "char", value: ch });
      }
    }
    flush();
    if (p < parts.length - 1)
      words.push([{ key: key++, kind: "mark", value: "{O}" }]);
  });
  return words;
}

const SIZES: [number, number][] = [
  [1440, 96],
  [1200, 80],
  [810, 54],
  [0, 34],
];

function useHeroFontSize() {
  const [size, setSize] = useState(96);
  useEffect(() => {
    const pick = () => {
      const w = window.innerWidth;
      setSize(SIZES.find(([min]) => w >= min)![1]);
    };
    pick();
    window.addEventListener("resize", pick);
    return () => window.removeEventListener("resize", pick);
  }, []);
  return size;
}

type Props = {
  text?: string;
  lineHeight?: number;
  letterSpacing?: number;
  iconRatio?: number;
  revealDuration?: number;
  revealStagger?: number;
  revealDistance?: number;
  revealDelay?: number;
  descenderPadding?: number;
  color?: string;
  align?: "left" | "center";
};

export default function LogoHeading({
  text = "{O} Blade",
  lineHeight = 0.9,
  letterSpacing = -0.02,
  iconRatio = 0.85,
  revealDuration = 0.8,
  revealStagger = 20,
  revealDistance = 16,
  revealDelay = 0,
  descenderPadding = 12,
  color = "#FAF9F5",
  align = "center",
}: Props) {
  const words = useMemo(() => tokenize(text), [text]);
  const fontSize = useHeroFontSize();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(t);
  }, []);

  const glyph = (i: number): CSSProperties => ({
    display: "inline-block",
    opacity: shown ? 1 : 0,
    transform: shown ? "translateY(0px)" : `translateY(${revealDistance}px)`,
    transition: `opacity ${revealDuration}s cubic-bezier(0.16, 1, 0.3, 1), transform ${revealDuration}s cubic-bezier(0.16, 1, 0.3, 1)`,
    transitionDelay: `${revealDelay + i * revealStagger}ms`,
    willChange: "opacity, transform",
  });

  return (
    <h1
      className="no-ft font-rsm"
      style={{
        display: "block",
        fontSize,
        fontWeight: 500,
        lineHeight: fontSize >= 96 ? 0.95 : lineHeight,
        letterSpacing: `${letterSpacing}em`,
        color,
        margin: 0,
        width: "100%",
        textAlign: align,
        overflow: "hidden",
        paddingBottom: descenderPadding,
        boxSizing: "border-box",
      }}
    >
      <span style={{ display: "block" }}>
        {words.map((word, w) => (
          <span key={w} style={{ display: "inline-block", whiteSpace: "pre" }}>
            {word.map((t) => (
              <span key={t.key} style={glyph(t.key)}>
                {t.kind === "mark" ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      whiteSpace: "nowrap",
                      gap: "0.04em",
                      verticalAlign: "middle",
                      color,
                      marginTop: "-0.15em",
                    }}
                  >
                    <BladeMark
                      size={fontSize * iconRatio}
                      color={color}
                      style={{
                        display: "inline-block",
                        verticalAlign: "middle",
                        flexShrink: 0,
                        position: "relative",
                        top: "-0.05em",
                      }}
                    />
                  </span>
                ) : t.kind === "space" ? (
                  " "
                ) : (
                  t.value
                )}
              </span>
            ))}
          </span>
        ))}
      </span>
    </h1>
  );
}
