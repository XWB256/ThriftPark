"use client";

const formatHoursToHM = (hours: number | null | undefined) => {
  if (!hours || hours <= 0) return "—";
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};

import { useState, useEffect } from "react";

/* ---------- Data model ---------- */
type ParkingSession = {
  id: string;
  username: string;
  parking_date: string;
  carpark_code: string;
  parking_planned_hours: number;
  parking_estimated_charge: number;
  parking_start_time: string;
  parking_end_time?: string;
  parking_actual_hours?: number;
  parking_charge?: number;
  parking_priv_charge?: number;
  original_parking_rate?: number;
  parking_savings?: number;
  isActive: boolean;
};

type Carpark = {
  name: string;
  code: string;
  location: string;
  rate: number;
  distance: number;
};

/* ---------- Page Component ---------- */
export default function ParkingPage() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [carparks, setCarparks] = useState<Carpark[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---------- Load user ---------- */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("thriftpark_user");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setCurrentUser(parsed?.username || null);
      } catch {
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
    }
  }, []);

  /* ---------- Fetch carparks (for display names) ---------- */
  useEffect(() => {
    const fetchCarparks = async () => {
      try {
        const res = await fetch("http://localhost:3002/get-carpark-list");
        const data = await res.json();
        if (data?.results) {
          const formatted = data.results.map((cp: any) => ({
            name: cp.address || "Unnamed Carpark",
            code: cp.carpark_code,
            location: cp.address,
            rate: parseFloat(cp.weekday_rate_1) || 2.0,
            distance: Math.random() * 1000,
          }));
          setCarparks(formatted);
        }
      } catch (err) {
        console.error("Error fetching carparks:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCarparks();
  }, []);

  /* ---------- Fetch user sessions ---------- */
  const fetchSessions = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`http://localhost:3005/get-all-sessions`);
      const data = await res.json();
      if (data?.sessions) {
        const userSessions = data.sessions.filter(
          (s: any) => s.username === currentUser
        );
        setSessions(userSessions);
      }
    } catch (err) {
      console.error("Error fetching sessions:", err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [currentUser]);

  /* ---------- End Session ---------- */
  const handleEndSession = async (session: ParkingSession) => {
    try {
      if (!currentUser) return alert("Please log in before ending a session.");
      const res = await fetch("http://localhost:3005/end-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: session.username,
          parking_planned_hours: session.parking_planned_hours,
          parking_start_time: session.parking_start_time,
          parking_charge:
            session.parking_charge ?? session.parking_estimated_charge,
          parking_priv_charge:
            session.parking_priv_charge ??
            session.original_parking_rate ??
            session.parking_estimated_charge ??
            session.parking_charge,
        }),
      });

      if (!res.ok) throw new Error("Failed to end session");

      await fetchSessions();
    } catch (err) {
      console.error("Error ending session:", err);
    }
  };

  const getCarparkDisplay = (code: string) => {
    const carpark = carparks.find((c) => c.code === code);
    return carpark ? `${carpark.name} (${carpark.code})` : code;
  };

  const activeSession = sessions.find((s) => s.isActive);
  const pastSessions = sessions.filter((s) => !s.isActive);

  /* ---------- UI ---------- */
  return (
    <div className="max-w-4xl mx-auto p-6 text-white">
      <h1 className="text-3xl font-semibold mb-6">My Parking Sessions</h1>

      {/* Active Session */}
      <div className="border border-yellow-700 bg-yellow-900/20 p-5 rounded-xl mb-6">
        <h2 className="text-xl text-yellow-400 mb-2">Active Session</h2>

        {!activeSession ? (
          <p className="text-gray-400">No active parking session right now.</p>
        ) : (
          <>
            <p>
              <strong>User:</strong> {currentUser ?? "Guest"}
            </p>
            <p>
              <strong>Carpark:</strong>{" "}
              {getCarparkDisplay(activeSession.carpark_code)}
            </p>
            <p>
              <strong>Start Time:</strong>{" "}
              {new Date(activeSession.parking_start_time).toLocaleTimeString()}
            </p>
            <p>
              <strong>Planned Hours:</strong>{" "}
              {activeSession.parking_planned_hours}
            </p>
            <p>
              <strong>Estimated Charge:</strong> $
              {activeSession.parking_estimated_charge.toFixed(2)}
            </p>

            <button
              onClick={() => handleEndSession(activeSession)}
              className="mt-3 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            >
              End Session
            </button>
          </>
        )}
      </div>

      {/* Past Sessions */}
      <div className="border p-4 rounded-xl shadow-sm">
        <h2 className="text-xl mb-3">Past Parking Sessions</h2>
        {pastSessions.length === 0 ? (
          <p className="text-gray-400">No past sessions yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-700 text-gray-300">
                <th className="text-left py-2">Date</th>
                <th className="text-left py-2">Start Time</th>
                <th className="text-left py-2">End Time</th>
                <th className="text-left py-2">Carpark</th>
                <th className="text-left py-2">Hours</th>
                <th className="text-left py-2">Charge ($)</th>
                <th className="text-left py-2">Savings ($)</th>
              </tr>
            </thead>
            <tbody>
              {pastSessions.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-gray-800 hover:bg-white/5 transition"
                >
                  <td className="py-2">
                    {s.parking_date
                      ? new Date(s.parking_date).toLocaleDateString("en-SG", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </td>

                  <td className="py-2">
                    {s.parking_start_time
                      ? new Date(s.parking_start_time).toLocaleTimeString()
                      : "—"}
                  </td>
                  <td className="py-2">
                    {s.parking_end_time
                      ? new Date(s.parking_end_time).toLocaleTimeString()
                      : "—"}
                  </td>
                  <td className="py-2">{getCarparkDisplay(s.carpark_code)}</td>
                  <td className="py-2">
                    {formatHoursToHM(s.parking_actual_hours)}
                  </td>
                  <td className="py-2">
                    {s.parking_charge?.toFixed(2) ??
                      s.parking_estimated_charge.toFixed(2)}
                  </td>
                  <td
                    className={`py-2 ${
                      (s.parking_savings ?? 0) >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {s.parking_savings?.toFixed(2) ?? "0.00"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
