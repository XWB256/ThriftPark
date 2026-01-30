"use client";

import { ReactNode } from "react";
import DotGrid from "@/components/DotGrid"; // reactbits.dev DotGrid component

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen w-full text-white">
      {/* Dot grid background */}
       <DotGrid
        dotSize={10}
        gap={15}
        baseColor="#1F382A"
        activeColor="#73FF00"
        proximity={120}
        shockRadius={250}
        shockStrength={5}
        resistance={750}
        returnDuration={1.5}
    />

      {/* Optional overlay for liquid glass effect */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-lg -z-10" />

      {/* Page content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
