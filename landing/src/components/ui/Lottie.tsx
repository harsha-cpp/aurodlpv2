"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AnimationItem } from "lottie-web";

type Props = {
  src: string;
  mode?: "ambient" | "once";
  loop?: boolean;
  speed?: number;
  threshold?: number;
  delay?: number;
  preserveAspectRatio?: string;
  className?: string;
  style?: CSSProperties;
  poster?: string;
  posterAlt?: string;
};

export default function Lottie({
  src,
  mode = "ambient",
  loop = true,
  speed = 1,
  threshold = 0.25,
  delay = 0,
  preserveAspectRatio = "xMidYMid slice",
  className,
  style,
  poster,
  posterAlt = "",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return;

    let cancelled = false;
    let anim: AnimationItem | null = null;
    let loaded = false;
    let visible = false;
    let started = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const playOnce = () => {
      if (started || !anim) return;
      started = true;
      timer = setTimeout(() => {
        if (!cancelled && anim) anim.goToAndPlay(0, true);
      }, delay);
    };

    const sync = () => {
      if (!loaded || !anim) return;
      if (mode === "ambient") {
        if (visible) anim.play();
        else anim.pause();
      } else if (visible) {
        playOnce();
      }
    };

    const load = async () => {
      try {
        const [{ default: lottie }, data] = await Promise.all([
          import("lottie-web"),
          fetch(src).then((r) => r.json()),
        ]);
        if (cancelled) return;
        anim = lottie.loadAnimation({
          container: stage,
          renderer: "svg",
          loop: mode === "ambient" ? loop : false,
          autoplay: false,
          animationData: data,
          rendererSettings: { preserveAspectRatio, progressiveLoad: true },
        });
        anim.setSpeed(speed);
        anim.addEventListener("DOMLoaded", () => {
          if (cancelled) return;
          loaded = true;
          setReady(true);
          sync();
        });
      } catch {
        /* keep the poster */
      }
    };

    const loader = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loader.disconnect();
          void load();
        }
      },
      { rootMargin: "600px 0px" },
    );
    loader.observe(host);

    const watcher = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        sync();
      },
      { threshold: mode === "once" ? threshold : 0 },
    );
    watcher.observe(host);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      loader.disconnect();
      watcher.disconnect();
      anim?.destroy();
    };
  }, [src, mode, loop, speed, threshold, delay, preserveAspectRatio]);

  const positioned =
    /\b(absolute|fixed|relative|sticky)\b/.test(className ?? "") ||
    style?.position !== undefined;

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ ...(positioned ? {} : { position: "relative" }), ...style }}
    >
      <div ref={stageRef} className="absolute inset-0" />
      {poster && !ready && (
        <img
          src={poster}
          alt={posterAlt}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}
