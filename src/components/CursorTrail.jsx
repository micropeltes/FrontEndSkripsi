import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

function TrailLight({ mouseX, mouseY, width, height, opacity, lag, variant }) {
  const x = useSpring(mouseX, {
    stiffness: Math.max(120, 440 - lag * 42),
    damping: 28 + lag * 3,
    mass: 0.22 + lag * 0.04
  });
  const y = useSpring(mouseY, {
    stiffness: Math.max(120, 440 - lag * 42),
    damping: 28 + lag * 3,
    mass: 0.22 + lag * 0.04
  });

  return (
    <motion.span
      className="cursor-light"
      style={{
        x,
        y,
        width,
        height,
        opacity,
        marginLeft: -width / 2,
        marginTop: -height / 2
      }}
    >
      <span className={`cursor-light-visual ${variant}`} />
    </motion.span>
  );
}

export default function CursorTrail({ lowPower = false }) {
  const [enabled, setEnabled] = useState(false);
  const mouseX = useMotionValue(-120);
  const mouseY = useMotionValue(-120);

  const rafRef = useRef(0);
  const pendingRef = useRef({ x: -120, y: -120 });

  const lights = useMemo(
    () => [
      { width: 42, height: 42, opacity: 0.34, lag: 0, variant: "cursor-halo" },
      { width: 16, height: 16, opacity: 0.92, lag: 0, variant: "cursor-core" },
      { width: 96, height: 6, opacity: 0.58, lag: 1, variant: "cursor-beam beam-cyan" },
      { width: 74, height: 5, opacity: 0.5, lag: 2, variant: "cursor-beam beam-magenta" },
      { width: 46, height: 3, opacity: 0.48, lag: 3, variant: "cursor-spark spark-lime" },
      { width: 28, height: 3, opacity: 0.42, lag: 4, variant: "cursor-spark spark-pink" }
    ],
    []
  );

  useEffect(() => {
    const pointerMedia = window.matchMedia("(pointer: fine)");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    function handleMediaChange() {
      setEnabled(pointerMedia.matches && !motionMedia.matches && !lowPower);
    }

    handleMediaChange();

    const unsubscribe = [];

    if (pointerMedia.addEventListener) {
      pointerMedia.addEventListener("change", handleMediaChange);
      motionMedia.addEventListener("change", handleMediaChange);
      unsubscribe.push(() => pointerMedia.removeEventListener("change", handleMediaChange));
      unsubscribe.push(() => motionMedia.removeEventListener("change", handleMediaChange));
    } else {
      pointerMedia.addListener(handleMediaChange);
      motionMedia.addListener(handleMediaChange);
      unsubscribe.push(() => pointerMedia.removeListener(handleMediaChange));
      unsubscribe.push(() => motionMedia.removeListener(handleMediaChange));
    }

    return () => {
      unsubscribe.forEach((fn) => fn());
    };
  }, [lowPower]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    function flushMove() {
      rafRef.current = 0;
      mouseX.set(pendingRef.current.x);
      mouseY.set(pendingRef.current.y);
    }

    function handleMove(event) {
      pendingRef.current = { x: event.clientX, y: event.clientY };

      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(flushMove);
      }
    }

    function handleLeave() {
      pendingRef.current = { x: -120, y: -120 };

      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(flushMove);
      }
    }

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerleave", handleLeave);

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }

      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerleave", handleLeave);
    };
  }, [enabled, mouseX, mouseY]);

  if (!enabled) {
    return null;
  }

  return (
    <div className="cursor-trail" aria-hidden>
      {lights.map((light, idx) => (
        <TrailLight
          key={`${light.variant}-${idx}`}
          mouseX={mouseX}
          mouseY={mouseY}
          width={light.width}
          height={light.height}
          lag={light.lag}
          opacity={light.opacity}
          variant={light.variant}
        />
      ))}
    </div>
  );
}
