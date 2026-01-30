"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, ChevronUp, ChevronDown } from "lucide-react";

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /* ---------- Load logged-in user ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("thriftpark_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCurrentUser(parsed?.username || null);
      } catch (err) {
        console.error("Failed to parse thriftpark_user:", err);
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
    }
  }, []);

  /* ---------- Fetch leaderboard from backend ---------- */
  useEffect(() => {
    fetch("http://localhost:3006/get-all-leaderboard")
      .then((res) => res.json())
      .then((data) => {
        if (data?.results) {
          const sorted = data.results.sort(
            (a: any, b: any) => b.total_savings - a.total_savings
          );
          setLeaderboard(sorted);
        }
      })
      .catch((err) => console.error("Error fetching leaderboard:", err))
      .finally(() => setLoading(false));
  }, []);

  /* ---------- Handle loading / empty states ---------- */
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center text-lg font-medium">
        Loading leaderboard...
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center text-lg font-medium">
        No leaderboard data available.
      </div>
    );
  }

  /* ---------- Rank calculations ---------- */
  const topThree = leaderboard.slice(0, 3);
  const userIndex = leaderboard.findIndex((d) => d.username === currentUser);
  const userRank = userIndex >= 0 ? userIndex + 1 : null;
  const userData = userIndex >= 0 ? leaderboard[userIndex] : null;

  const shownUsers = expanded
    ? leaderboard
    : [
        leaderboard[0],
        leaderboard[1],
        leaderboard[2],
        "dots",
        leaderboard[userIndex],
      ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans px-6 md:px-20 py-16">
      {/* ---------- Title ---------- */}
      <h1 className="text-4xl md:text-5xl font-semibold mb-12 text-center tracking-tight text-white">
        Leaderboard
      </h1>

      {/* ---------- Top 3 Podium ---------- */}
      <div className="flex justify-center items-end gap-6 mb-12">
        {topThree.map((user, idx) => (
          <motion.div
            key={user.username}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: idx * 0.15, type: "spring" }}
            className="flex flex-col items-center"
          >
            <span className="text-lg font-medium mb-1 text-white">
              #{idx + 1}
            </span>
            {idx === 0 && <Crown className="text-yellow-400 mb-1" size={24} />}
            <Card
              className={`backdrop-blur-xl bg-white/10 border border-white/20 w-32 py-3 flex flex-col items-center justify-center rounded-xl shadow-md transition-all ${
                user.username === currentUser
                  ? "ring-2 ring-emerald-400 shadow-emerald-400/30"
                  : ""
              }`}
            >
              <p className="font-semibold text-base text-white">
                {user.username}
              </p>
              <p className="text-xs text-white mt-1">
                💰 ${user.total_savings.toFixed(2)} | 🚗 {user.parking_sessions}
              </p>
            </Card>
            <div
              className="mt-1 w-10 rounded-t-full"
              style={{
                height: idx === 0 ? "60px" : idx === 1 ? "45px" : "35px",
                background: "linear-gradient(180deg, #ffffff60, #ffffff10)",
              }}
            ></div>
          </motion.div>
        ))}
      </div>

      {/* ---------- User Banner ---------- */}
      {currentUser && userData && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="max-w-2xl mx-auto mb-10 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border border-white/20 rounded-2xl p-6 text-center shadow-lg"
        >
          <h2 className="text-lg text-white/70 mb-2">Your Ranking</h2>
          <div className="flex flex-col sm:flex-row justify-center sm:items-center gap-3">
            <p className="text-3xl font-bold text-emerald-300">
              #{userRank ?? "-"}
            </p>
            <p className="text-2xl font-semibold">{userData.username}</p>
          </div>
          <div className="mt-3 text-white/80 text-sm sm:text-base">
            💰{" "}
            <span className="font-semibold">
              ${userData.total_savings.toFixed(2)}
            </span>{" "}
            saved · 🚗{" "}
            <span className="font-semibold">{userData.parking_sessions}</span>{" "}
            sessions
          </div>
        </motion.div>
      )}

      {/* ---------- Remaining Users ---------- */}
      <div className="max-w-2xl mx-auto">
        <AnimatePresence>
          {shownUsers.map((user) =>
            user === "dots" ? (
              <div key="dots" className="text-center text-white text-xl my-3">
                ...
              </div>
            ) : (
              typeof user === "object" &&
              user !== null && (
                <motion.div
                  key={user.username}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.25 }}
                >
                  <Card
                    className={`my-2 backdrop-blur-xl px-4 py-3 flex justify-between items-center rounded-lg border border-white/20 shadow-md transition-all ${
                      user.username === currentUser
                        ? "bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400 shadow-emerald-400/20"
                        : "bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className="font-semibold text-sm text-white">
                      #{leaderboard.indexOf(user) + 1}
                    </span>
                    <span className="font-medium text-sm text-white">
                      {user.username}
                    </span>
                    <span className="text-sm text-white">
                      💰 ${user.total_savings.toFixed(2)}
                    </span>
                    <span className="text-sm text-white">
                      🚗 {user.parking_sessions}
                    </span>
                  </Card>
                </motion.div>
              )
            )
          )}
        </AnimatePresence>
      </div>

      {/* ---------- Expand / Collapse ---------- */}
      <div className="flex justify-center mt-8">
        <Button
          onClick={() => setExpanded(!expanded)}
          className="backdrop-blur-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-3xl px-6 py-2 text-base font-semibold shadow-md transition-all flex items-center gap-2"
        >
          {expanded ? (
            <>
              Collapse <ChevronUp size={16} />
            </>
          ) : (
            <>
              Show More <ChevronDown size={16} />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
