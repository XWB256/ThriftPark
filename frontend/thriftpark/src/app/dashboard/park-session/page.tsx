"use client";

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
  const currentUser = "Sean"; // logged-in user (mock)

  // const getCarparkDisplay = (code: string) => {
  //   const carpark = nearbyCarparks.find((c) => c.code === code);
  //   return carpark ? `${carpark.name} (${carpark.code})` : code;
  // };

  // const nearbyCarparks: Carpark[] = [
  //   {
  //     name: "Marina Bay Carpark",
  //     code: "URA-MBS001",
  //     location: "Marina Bay Sands, Singapore",
  //     rate: 3.5,
  //     distance: 450,
  //   },
  //   {
  //     name: "Orchard Central Carpark",
  //     code: "URA-ORC002",
  //     location: "Orchard Rd, Singapore",
  //     rate: 4.0,
  //     distance: 600,
  //   },
  //   {
  //     name: "Tampines Hub Carpark",
  //     code: "HDB-TAMP003",
  //     location: "Our Tampines Hub, Singapore",
  //     rate: 1.5,
  //     distance: 900,
  //   },
  // ];

  const [sessions, setSessions] = useState<ParkingSession[]>([]);
  const [carparks, setCarparks] = useState<Carpark[]>([]);
  const [selectedCarpark, setSelectedCarpark] = useState<Carpark | null>(null);
  const [plannedHours, setPlannedHours] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCarparks = async () => {
      try {
        const res = await fetch("http://localhost:3002/get-carpark-list");
        const data = await res.json();
        if (data?.results) {
          const formatted = data.results.map((cp: any) => ({
            name: cp.address || "Unnamed Carpark",
            code: cp.carpark_code /*|| "9999"*/, // in case theres no carpark code for some reason
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
    try {
      const res = await fetch("http://localhost:3005/get-all-sessions");
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
  }, []);

  /* ---------- Start Session ---------- */
  const handleStartSession = async () => {
    if (!selectedCarpark) return alert("Please select a carpark first.");
    if (plannedHours <= 0)
      return alert("Please enter a valid duration (≥ 0.5).");

    const now = new Date();

    // create new session
    const newSession = {
      username: currentUser,
      parking_date: now.toISOString().split("T")[0],
      carpark_code: selectedCarpark.code,
      parking_planned_hours: plannedHours,
      parking_estimated_charge: plannedHours * selectedCarpark.rate,
      parking_start_time: now.toISOString(),
      parking_end_time: null,
      parking_actual_hours: null,
      // this one idk how to get the priv carpark rate from carpark search(?)
      // missing this info will affect the create-session API call cause it's missing the parking_priv_charge so for now i just put 1.5x
      parking_priv_charge: selectedCarpark.rate * 1.5,
      parking_savings: null,
    };

    try {
      const createRes = await fetch("http://localhost:3005/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSession),
      });

      if (!createRes.ok) throw new Error("Failed to create session");

      const startRes = await fetch("http://localhost:3005/start-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: currentUser,
        }),
      });

      if (!startRes.ok) throw new Error("Failed to start session");

      await fetchSessions();
      setSelectedCarpark(null);
      setPlannedHours(1);
    } catch (err) {
      console.error("Error starting session:", err);
    }
  };

  /* ---------- End Session ---------- */
  const handleEndSession = async (session: ParkingSession) => {
    try {
      const res = await fetch("http://localhost:3005/end-session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: session.username,
          parking_planned_hours: session.parking_planned_hours,
          parking_start_time: session.parking_start_time,
          parking_rate: session.parking_charge,
          parking_private_rate: session.parking_priv_charge,
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
      <h1 className="text-3xl font-semibold mb-6">Parking Sessions</h1>

      {/* Start New Session */}
      <div className="border p-4 rounded-xl mb-6 shadow-sm">
        <h2 className="text-xl mb-3">Start a New Session</h2>

        {/* Carpark selection list */}
        <label className="block mb-2 text-sm text-gray-300">
          Choose a nearby carpark:
        </label>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <select
            className="border border-gray-600 p-2 rounded w-full text-white"
            value={selectedCarpark?.code || ""}
            onChange={(e) =>
              setSelectedCarpark(
                carparks.find((c) => c.code === e.target.value) || null
              )
            }
          >
            <option value="">-- Select Carpark --</option>
            {carparks.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} — {c.distance}m away (${c.rate}/hr)
              </option>
            ))}
          </select>
        </div>

        {/* Planned hours */}
        <label className="block text-sm mb-2 text-gray-300">
          Planned Hours (increments of 30 mins):
        </label>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={plannedHours}
          onChange={(e) => setPlannedHours(Number(e.target.value))}
          className="border border-gray-600 p-2 rounded w-full mb-4 text-white"
        />

        <button
          onClick={handleStartSession}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Start Session
        </button>
      </div>

      {/* Active Session */}
      {activeSession && (
        <div className="border border-yellow-700 bg-yellow-900/20 p-5 rounded-xl mb-6">
          <h2 className="text-xl text-yellow-400 mb-2">Active Session</h2>
          <p>
            <strong>User:</strong> {currentUser}
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
        </div>
      )}

      {/* Past Sessions */}
      <div className="border p-4 rounded-xl mb-6 shadow-sm">
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
                  <td className="py-2">{s.parking_date}</td>
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
                  <td className="py-2">{s.parking_actual_hours?.toFixed(2)}</td>
                  <td className="py-2">{s.parking_charge?.toFixed(2)}</td>
                  <td
                    className={`py-2 ${
                      (s.parking_savings ?? 0) >= 0
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {s.parking_savings?.toFixed(2)}
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
