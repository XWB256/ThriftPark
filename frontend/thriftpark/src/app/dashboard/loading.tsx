import { Helix } from "ldrs/react";
import "ldrs/react/Helix.css";

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <Helix size="60" speed="2.5" color="white" />
    </div>
  );
}
