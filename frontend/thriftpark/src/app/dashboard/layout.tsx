"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Helix } from "ldrs/react";
import "ldrs/react/Helix.css";
import LiquidEther from "@/components/LiquidEther";
import CardNav from "@/components/CardNav"; 
import { isMobile } from "react-device-detect";
import { on } from "events";
import { color } from "framer-motion";
import LightRays from "@/components/LightRays"

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Helix size="60" speed="2.5" color="white" />
      </div>
    );
  }

  // CardNav items
  const items = [
    {
      label: "Parking Activities",
      bgColor: "rgba(255, 255, 255, 0.05)", // almost transparent
      textColor: "#fff",
      links: [
        { label: "Find a Carpark", ariaLabel: "Find Carpark Lots", href: "/dashboard/carpark-search" },
        // { label: "Compare Parking", ariaLabel: "Compare costs", href: "/dashboard/costcomparison" },
        { label: "My Parking Sessions", ariaLabel: "Parking Session", href: "/dashboard/park-session" },
        
      ],
    },
    {
      label: "Community",
      bgColor: "rgba(255, 255, 255, 0.05)",
      textColor: "#fff",
      links: [
        { label: "Drivers' Forum", ariaLabel: "Chat with drivers", href: "/dashboard/drivers-forum" },
        { label: "Leaderboard", ariaLabel: "Drivers' Ranking", href: "/dashboard/leaderboard" },
      ],
    },
    {
      label: "Other Options",
      bgColor: "rgba(255, 255, 255, 0.05)",
      textColor: "#fff",
      links: [
        { label: "Home", ariaLabel: "Dashboard", href: "/dashboard"},
        { label: "My Account", ariaLabel: "Account Management", href: "/dashboard/settings" },
        { label: "Logout", ariaLabel: "Parking History", href: "/" , onClick: () => router.push("/"), color: "red"},
      ],
    }
  ];

  return (
    <div className="relative w-full min-h-screen bg-black flex flex-col">
      {/* Interactive Background */}
      <div className="absolute inset-0 z-0">
        <LightRays
          raysOrigin="top-center"
          raysColor="#00ffff"
          raysSpeed={1.5}
          lightSpread={0.8}
          rayLength={1.2}
          followMouse={true}
          mouseInfluence={0.1}
          noiseAmount={0.1}
          distortion={0.05}
          className="custom-rays"
        />
      </div>
      {/* header div */}
      <div className="relative flex items-center px-12 py-6 z-20">
        {/* home button */}
        <button
          onClick = { () => router.push("/dashboard") }
          className="bg-transparent p-4 shadow-md transition-all"
        >
        <img
          src = "/herologo_header.png"
          alt="Hero Logo"
          className="w-[200] mx-auto"
        />
        </button>

        {/* CardNav */}
        <div className="ml-10">
          <CardNav
            logo="ThriftPark"
            logoAlt="ThriftPark Logo"
            items={items}
            baseColor="rgba(255,255,255,0.05)"   // subtle translucency
            menuColor="rgba(0,0,0,0.3)"         // faint dark
            ease="power3.out"
              className="backdrop-blur-sm border border-white/20 rounded-xl"  // enhanced border
        // glass effect
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 relative z-10 p-8 text-white">{children}</main>
    </div>
  );
}
