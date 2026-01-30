function normalizeDateTime(isoString) {
  if (!isoString) return null;
  return isoString.replace("T", " ").replace("Z", "").split(".")[0];
}

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const fs = require("fs");
const csv = require("csv-parser");

const app = express();
const PORT = process.env.PORT || 3005;
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
  host: "10.96.188.212",
  user: "host",
  password: "ThriftParkDB",
  database: "thriftpark",
  port: 3306,
});

db.connect((err) => {
  if (err) {
    console.error("Error connecting to ThriftPark Database", err.stack);
    return;
  }
  console.log("Connected to ThriftPark Database successfully!");
});

// --- CREATE NEW PARKING SESSION TO DATABASE ---
app.post("/create-session", (req, res) => {
  const {
    username,
    parking_date,
    carpark_code,
    parking_planned_hours,
    parking_estimated_charge,
    parking_start_time,
    parking_end_time,
    parking_actual_hours,
    original_parking_rate,
    parking_savings,
  } = req.body;

  console.log("📥 Incoming session payload:", req.body);

  if (!username || !carpark_code) {
    return res.status(400).json({ error: "Missing username or carpark code" });
  }

  // Use provided rate or fallback
  const actualRate =
    req.body.actual_parking_rate ?? original_parking_rate ?? null;
  const referenceRate = original_parking_rate ?? null;

  // Step 1: Check if user already has an active session
  const checkQuery =
    "SELECT id FROM parking_session_info WHERE username = ? AND isActive = 1 LIMIT 1";

  db.query(checkQuery, [username], (checkErr, rows) => {
    if (checkErr) {
      console.error(
        "[Database Error] Failed to check active sessions:",
        checkErr
      );
      return res
        .status(500)
        .json({ error: "Database error while checking active sessions" });
    }

    if (rows.length > 0) {
      console.warn(
        `[Duplicate Session Blocked] User ${username} already has an active session.`
      );
      return res.status(400).json({
        error:
          "You already have an active parking session. Please end it before starting a new one.",
      });
    }

    // Step 2: Create a new session
    const insertQuery = `
      INSERT INTO parking_session_info (
        username,
        parking_date,
        carpark_code,
        parking_planned_hours,
        parking_estimated_charge,
        parking_start_time,
        parking_end_time,
        parking_actual_hours,
        parking_charge,
        parking_priv_charge,
        parking_savings,
        isActive,
        create_datetime,
        update_datetime
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;

    db.query(
      insertQuery,
      [
        // matches column order in INSERT
        username, // username
        parking_date, // parking_date
        carpark_code, // carpark_code
        parking_planned_hours, // parking_planned_hours
        parking_estimated_charge, // parking_estimated_charge
        parking_start_time, // parking_start_time
        parking_end_time, // parking_end_time
        parking_actual_hours, // parking_actual_hours
        actualRate, // parking_charge
        referenceRate, // parking_priv_charge
        parking_savings, // parking_savings
      ],
      (insertErr, results) => {
        if (insertErr) {
          console.error("[Database Error] Failed to add session:", insertErr);
          return res.status(500).json({ error: insertErr.message });
        }

        // Console confirmation
        console.log(
          `[Session Created] ID=${results.insertId}, User=${username}, Carpark=${carpark_code}, ` +
            `Rate=${actualRate ?? "N/A"}, Reference=${referenceRate ?? "N/A"}`
        );

        res.status(201).json({
          message: "Session created successfully",
          id: results.insertId,
        });
      }
    );
  });
});

// get all sessions of a specific user
app.get("/get-sessions", (req, res) => {
  const { username } = req.body;
  const query = "SELECT * from parking_session_info WHERE username = ?";

  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to find the user", err);
      return res.status(500).send("Error getting the current user");
    }

    if (results.length === 0) {
      return res.status(404).json({
        error: "No sessions found for this user",
      });
    }

    return res.status(200).json({
      message: "Sessions retrieved successfully",
      sessions: results,
    });
  });
});

// get all from DB
app.get(`/get-all-sessions`, (req, res) => {
  const query = `SELECT * FROM parking_session_info`;

  db.query(query, (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to get list of sessions");
      return res.status(500).send("Error getting sessions");
    }

    if (results.length === 0) {
      return res.status(404).json({
        error: "No sessions found at all",
      });
    }

    return res.status(200).json({
      message: "Sessions retrieved successfully",
      sessions: results,
    });
  });
});

// get all active sessions from DB
app.get("/get-active-session/:username", (req, res) => {
  const { username } = req.params;

  if (!username) {
    return res.status(400).json({ error: "Username missing" });
  }

  const query = `
    SELECT * 
    FROM parking_session_info 
    WHERE username = ? AND isActive = 1
    ORDER BY id DESC
    LIMIT 1
  `;

  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to fetch active session:", err);
      return res.status(500).json({ error: err.message });
    }

    if (results.length === 0) {
      return res.status(200).json({ activeSession: null });
    }

    return res.status(200).json({ activeSession: results[0] });
  });
});

// start-session (only username is provided)
app.put("/start-session", (req, res) => {
  const { username, parking_charge, parking_priv_charge } = req.body;

  if (!username) {
    return res.status(400).json({ error: "Username missing" });
  }

  const query = `
    UPDATE parking_session_info
    SET 
      parking_start_time = CURRENT_TIMESTAMP,
      parking_charge = COALESCE(?, parking_charge),
      parking_priv_charge = COALESCE(?, parking_priv_charge),
      isActive = 1,
      update_datetime = CURRENT_TIMESTAMP
    WHERE username = ?
    ORDER BY id DESC
    LIMIT 1
  `;

  db.query(
    query,
    [parking_charge, parking_priv_charge, username],
    (err, results) => {
      if (err) {
        console.error("[Database Error] Failed to update start-session:", err);
        return res.status(500).json({ error: err.message });
      }

      if (results.affectedRows === 0) {
        return res
          .status(404)
          .json({ error: "No active session found for user" });
      }

      return res.status(200).json({ message: "Session started successfully" });
    }
  );
});

// --- Helper: Compute charge with 10-min grace and 30-min billing blocks ---
function computeBilledHours(totalMinutes) {
  if (totalMinutes <= 10) return 0; // grace zone (no charge)
  // After 10min grace, start counting in 30-min blocks
  const chargeable = totalMinutes - 10;
  const billedBlocks = Math.ceil(chargeable / 30); // each started block
  return billedBlocks * 0.5; // each block = 0.5 hour
}

const axios = require("axios");

// --- END SESSION ---
app.put("/end-session", async (req, res) => {
  const { username, parking_start_time, parking_charge, parking_priv_charge } =
    req.body;

  if (!username || !parking_start_time) {
    return res.status(400).json({ error: "Missing username or start time" });
  }

  try {
    const start = new Date(parking_start_time);
    const end = new Date(); // current time
    const minutesActual = Math.max(0, Math.floor((end - start) / 60000));

    // --- Grace + Billing logic ---
    const halfHourBlocks = Math.ceil(minutesActual / 30);
    const billedHours = halfHourBlocks * 0.5; // 0.5 hr per block

    const actualRate = Number(parking_charge ?? 0);
    const referenceRate = Number(parking_priv_charge ?? parking_charge ?? 0);

    const actualCost = +(actualRate * billedHours).toFixed(2);
    const referenceCost = +(referenceRate * billedHours).toFixed(2);
    const savings = +(referenceCost - actualCost).toFixed(2);

    // --- Update parking session ---
    const q = `
      UPDATE parking_session_info
      SET
        parking_end_time = CURRENT_TIMESTAMP,
        parking_actual_hours = ?,
        parking_charge = ?,
        parking_estimated_charge = ?,
        parking_savings = ?,
        isActive = 0,
        update_datetime = CURRENT_TIMESTAMP
      WHERE username = ?
      ORDER BY id DESC
      LIMIT 1
    `;

    await new Promise((resolve, reject) => {
      db.query(
        q,
        [
          (minutesActual / 60).toFixed(2),
          actualCost,
          referenceCost,
          savings,
          username,
        ],
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    });

    console.log(
      `✅ Session ended for ${username}. Savings: $${savings.toFixed(2)}`
    );

    // --- Update leaderboard service ---
    try {
      const leaderboardURL = "http://localhost:3006";
      console.log(`🔗 Connecting to Leaderboard Service for ${username}`);

      // Try to fetch existing leaderboard record
      let existing = null;
      try {
        const lbRes = await axios.get(
          `${leaderboardURL}/get-leaderboard/${username}`
        );
        if (lbRes.data?.results?.length > 0) {
          existing = lbRes.data.results[0];
        }
      } catch (lbFetchErr) {
        if (lbFetchErr.response && lbFetchErr.response.status === 404) {
          console.log(`No leaderboard entry found for ${username}`);
        } else {
          throw lbFetchErr;
        }
      }

      if (existing) {
        // Update existing record
        const newSavings =
          parseFloat(existing.total_savings || 0) + parseFloat(savings);
        const newSessions = parseInt(existing.parking_sessions || 0) + 1;

        await axios.put(`${leaderboardURL}/edit-leaderboard/${username}`, {
          total_savings: newSavings,
          parking_sessions: newSessions,
        });

        console.log(
          `🏆 Updated leaderboard for ${username}: total=$${newSavings.toFixed(
            2
          )}, sessions=${newSessions}`
        );
      } else {
        // Create new leaderboard entry
        await axios.post(`${leaderboardURL}/add-leaderboard`, {
          username,
          total_savings: Math.max(0, parseFloat(savings) || 0),
          parking_sessions: 1,
        });

        console.log(`🆕 Created new leaderboard entry for ${username}`);
      }
    } catch (lbErr) {
      console.error("⚠️ Leaderboard update failed:", lbErr.message);
    }

    return res.status(200).json({
      message: "Session ended successfully",
      username,
      minutesActual,
      billedHours,
      actualCost,
      referenceCost,
      savings,
    });
  } catch (err) {
    console.error("❌ Failed to end session:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.delete("/delete-session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const query = "DELETE FROM parking_session_info WHERE id = ?";

  db.query(query, [sessionId], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to delete session", err);
      return res.status(500).json({ error: "Error deleting session" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: "Session not found" });
    }

    return res.status(200).json({ message: "Session deleted successfully" });
  });
});

app.listen(PORT, () => {
  console.log(
    `parkingsession-service is up! server is running on port ${PORT}`
  );
});
