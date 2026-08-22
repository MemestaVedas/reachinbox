import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./BorderGlow.css";

interface BorderGlowProps {
  children: ReactNode;
  className?: string;
  backgroundColor?: string;
  borderRadius?: number;
  colors?: string[];
}

export function BorderGlow({ children, className = "", backgroundColor = "#120F17", borderRadius = 28, colors = ["#c084fc", "#f472b6", "#38bdf8"] }: BorderGlowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
  };
  const style = { "--card-bg": backgroundColor, "--radius": `${borderRadius}px`, "--glow-one": colors[0], "--glow-two": colors[1], "--glow-three": colors[2] } as CSSProperties;
  return <div ref={ref} className={`border-glow-card ${className}`} style={style} onPointerMove={onPointerMove}><div className="border-glow-inner">{children}</div></div>;
}
