"use client";

import { ReactNode } from "react";

export default function SignUpLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen font-sans">
      {children}
    </div>
  );
}
