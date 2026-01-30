const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();
const PORT = process.env.PORT || 3006;
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
  console.log("Connected to ThiftPark Database successfully!");
});

app.post("/add-leaderboard", (req, res) => {
  const { id, username, total_savings, parking_sessions } = req.body;

  const leaderboard = { username, total_savings, parking_sessions };

  db.query(`INSERT INTO leaderboard SET ?`, leaderboard, (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to add leaderboard entry", err);
      return res.status(500).send("Error adding leaderboard entry");
    }
    return res
      .status(200)
      .json({ message: "Leaderboard entry added successfully!" });
  });
});

app.get("/get-all-leaderboard", (req, res) => {
  const query = `SELECT * FROM leaderboard`;
  db.query(query, (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to retrieve leaderboard", err);
      return res.status(500).send("Error retrieving leaderboard");
    }
    return res.status(200).json({ message: "Results returned", results });
  });
});

app.get("/get-leaderboard/:username", (req, res) => {
  const { username } = req.params;
  const query = `SELECT * FROM leaderboard WHERE username = ?`;

  db.query(query, [username], (err, results) => {
    if (err) {
      console.error(
        "[Database Error] Failed to retrieve leaderboard entry",
        err
      );
      return res.status(500).send("Error retrieving leaderboard entry");
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Leaderboard entry not found" });
    }
    return res.status(200).json({ message: "Results returned", results });
  });
});

app.put("/edit-leaderboard/:username", (req, res) => {
  const { username } = req.params;
  const { total_savings, parking_sessions } = req.body;

  if (total_savings === undefined || parking_sessions === undefined) {
    return res
      .status(400)
      .json({ error: "Both total_savings and parking_sessions are required" });
  }

  const query = `
        UPDATE leaderboard 
        SET 
            total_savings = ?, 
            parking_sessions = ?, 
            update_datetime = CURRENT_TIMESTAMP
        WHERE username = ?`;

  db.query(
    query,
    [total_savings, parking_sessions, username],
    (err, results) => {
      if (err) {
        console.error(
          "[Database Error] Failed to update leaderboard entry",
          err
        );
        return res.status(500).send("Error updating leaderboard entry");
      }
      if (results.affectedRows === 0) {
        return res.status(404).json({ error: "Leaderboard entry not found" });
      }

      return res
        .status(200)
        .json({ message: "Leaderboard entry updated successfully" });
    }
  );
});

app.delete("/delete-leaderboard/:username", (req, res) => {
  const { username } = req.params;

  const query = `DELETE FROM leaderboard WHERE username = ?`;

  db.query(query, [username], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to delete leaderboard entry", err);
      return res.status(500).send("Error deleting leaderboard entry");
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: "Leaderboard entry not found" });
    }

    return res
      .status(200)
      .json({ message: "Leaderboard entry deleted successfully" });
  });
});

app.listen(PORT, () => {
  console.log(`leaderboard-service is up! server is running on port ${PORT}`);
});
