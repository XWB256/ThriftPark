"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import DarkVeil from "@/components/DarkVeil";
import TextType from "@/components/TextType";
import { motion } from "framer-motion";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // ---- LOGIN WITH PASSWORD ----
const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!email || !password) {
    alert("Please enter both email and password.");
    return;
  }

  setLoading(true);
  try {
    const response = await fetch("http://localhost:3007/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || data.message || "Login failed");

    // data.user should include 'username' from DB
    const user = {
      username: data.user.username, // unique username from DB
      name: data.user.name,
      email: data.user.email,
      vehicle_type: data.user.vehicle_type,
      phone_number: data.user.phone_number,
    };

    // store full user object
    localStorage.setItem("thriftpark_user", JSON.stringify(user));

    alert("Login successful!");
    router.push("/dashboard");
  } catch (err: any) {
    console.error("Login error:", err);
    alert(err.message || "An error occurred during login.");
  } finally {
    setLoading(false);
  }
};


  const handleGoogleSignIn = () => {
    console.log("Google Sign-In clicked");
  };

  return (
    <div className="flex min-h-screen font-sans">
      {/* Left side */}
      <div className="w-1/2 relative flex items-center justify-center bg-black overflow-hidden">
        <DarkVeil
          hueShift={0}
          noiseIntensity={0.02}
          scanlineIntensity={0.05}
          speed={0.5}
          scanlineFrequency={50}
          warpAmount={0.03}
          resolutionScale={1}
        />
        <div className="absolute text-center text-white z-10 px-4">
          <h1 className="text-4xl font-bold">ThriftPark</h1>
          <TextType
            text={[
              "Affordable Parking",
              "Effortless Wayfinding",
              "The Freedom to Park Smarter",
            ]}
            typingSpeed={75}
            pauseDuration={1500}
            showCursor={true}
            cursorCharacter="|"
          />
        </div>
      </div>

      {/* Right side - Login form */}
      <motion.div
        className="w-1/2 flex items-center justify-center bg-black text-white relative overflow-hidden"
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="max-w-sm w-full p-8 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 shadow-lg">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            Login to ThriftPark
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black text-white border border-white/30 rounded-md focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 bg-black text-white border border-white/30 rounded-md focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white/10 text-white py-2 rounded-md hover:bg-white/20 transition"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>

          <div className="flex items-center my-6">
            <div className="flex-grow border-t border-white/50"></div>
          </div>

          <p className="text-center text-sm text-white/70">
            Don’t have an account?{" "}
            <a href="/signup" className="font-medium text-white underline">
              Sign up
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}