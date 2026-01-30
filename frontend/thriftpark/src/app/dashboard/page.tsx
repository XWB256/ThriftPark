"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function HeroPage() {

  const router = useRouter();

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
      className="relative z-10 min-h-screen flex justify-center items-center text-center px-6 sm:px-16 bg-transparent"
    >
      <div className="flex flex-col items-center space-y-10">
        {/* Hero Logo */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: -100, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          <img
            src="/herologo.png"
            alt="Hero Logo"
            className="w-[420px] sm:w-[500px] md:w-[600px] lg:w-[700px] mx-auto drop-shadow-[0_0_25px_rgba(255,255,255,0.25)]"
          />
        </motion.div>

        {/* Call-to-Action Buttons */}
        <motion.div
        initial={{ y: 0, opacity: 0 }}
        animate={{ y: -200, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.6 }}
        className="grid grid-cols-4 sm:grid-cols-4 gap-6 justify-center items-center"
      >
        <Button 
          variant="outline"
          className="bg-transparent border border-white text-white text-lg flex justify-center items-center font-semibold aspect-square h-44 w-48 rounded-lg shadow-md hover:scale-105 transition-transform"
          onClick={() => router.push('/dashboard/carpark-search')}
          >
          Find Parking
        </Button>
        <Button
            variant="outline"
            className="bg-transparent border border-white text-white text-lg flex justify-center items-center font-semibold aspect-square h-44 w-48 rounded-lg shadow-md hover:scale-105 transition-transform"
            onClick={() => router.push("/dashboard/park-session")}
            >
          My Parking Sessions
        </Button>
        <Button
            variant="outline"
            className="bg-transparent border border-white text-white text-lg flex justify-center items-center font-semibold aspect-square h-44 w-48 rounded-lg shadow-md hover:scale-105 transition-transform"
            onClick={() => router.push("/dashboard/drivers-forum")}
            >
          Drivers' Forum
        </Button>
        <Button
            variant="outline"
            className="bg-transparent border border-white text-white text-lg flex justify-center items-center font-semibold aspect-square h-44 w-48 rounded-lg shadow-md hover:scale-105 transition-transform"
            onClick={() => router.push('/dashboard/leaderboard')}
            >
          Leaderboard
        </Button>
      </motion.div>
      </div>
    </motion.section>
  );
}
