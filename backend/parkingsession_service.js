const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');
const fs = require('fs')
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3005;
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: '10.96.188.212',
    user: 'host',
    password: 'ThriftParkDB',
    database: 'thriftpark',
    port: 3306
})

db.connect((err) => {
    if (err) {
        console.error('Error connecting to ThriftPark Database', err.stack);
        return;
    }
    console.log('Connected to ThriftPark Database successfully!');
})

// add a new session to the database
app.post('/create-session', (req, res) =>
{
    const { username, 
            parking_date, 
            carpark_code, 
            parking_planned_hours, 
            parking_estimated_charge,
            parking_start_time,
            parking_end_time,
            parking_actual_hours,
            parking_priv_charge,
            parking_savings } = req.body;

    const query = ` INSERT INTO parking_session_info (  username, 
                                                        parking_date, 
                                                        carpark_code, 
                                                        parking_planned_hours, 
                                                        parking_estimated_charge,
                                                        parking_start_time,
                                                        parking_end_time,
                                                        parking_actual_hours,
                                                        parking_priv_charge,
                                                        parking_savings,
                                                        create_datetime,
                                                        update_datetime) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`

    db.query(query, [   username, 
                        parking_date, 
                        carpark_code, 
                        parking_planned_hours, 
                        parking_estimated_charge,
                        parking_start_time,
                        parking_end_time,
                        parking_actual_hours,
                        parking_priv_charge,
                        parking_savings], (err, results) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to add session to table of sessions");
            return res.status(500).send("Error adding session info");
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: "Session not found" });
        }

        return res.status(200).json({ message: "Session updated successfully" });
    });
});

// get all sessions of a specific user
app.get('/get-sessions', (req, res) => 
{
    const { username } = req.body;
    const query = "SELECT * from parking_session_info WHERE username = ?"

    db.query(query, [username], (err, results) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to find the user", err);
            return res.status(500).send("Error getting the current user");
        }

        if (results.length === 0) {
            return res.status(404).json({ 
                error: "No sessions found for this user" 
            });
        }

        return res.status(200).json({ 
            message: "Sessions retrieved successfully", 
            sessions: results 
        });
    });
});

// get all from DB
app.get(`/get-all-sessions`, (req, res) =>
{
    const query = `SELECT * FROM parking_session_info`;

    db.query(query, (err, results) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to get list of sessions")
            return res.status(500).send("Error getting sessions")
        }

        if (results.length === 0)
        {
            return res.status(404).json({
                error: "No sessions found at all"
            })
        }

        return res.status(200).json({ 
            message: "Sessions retrieved successfully", 
            sessions: results 
        });
    })
});

// start-session (only username is provided)
app.put(`/start-session`, (req, res) =>
{
    const {username} = req.body;

    const query = ` UPDATE parking_session_info
                    SET 
                    parking_start_time = CURRENT_TIMESTAMP,
                    update_datetime = CURRENT_TIMESTAMP
                    WHERE username = ?`;

    db.query(query, [username], (err, results) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to add session to table of sessions");
            return res.status(500).send("Error updating session info");
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: "Session not found" });
        }

        return res.status(200).json({ message: "Session updated successfully" });
    })
});

// end-session (username, planned hours, start time, parking charge, parking priv charge provided in body)
app.put(`/end-session`, (req, res) => {
    const { username, plannedHours, startDateTime, parkingCharge, parkingPrivateCharge } = req.body;

    // How much they would've spent
    const almostSpent = parkingPrivateCharge * plannedHours;

    const startDate = new Date(startDateTime); 
    const currentDate = new Date();

    const hoursActual = Math.abs((currentDate - startDate) / 36e5); // Difference in hours (1 hour = 36e5 milliseconds)
    const actualSpent = hoursActual * parkingCharge;
    const savings = almostSpent - actualSpent;

    const query = `UPDATE parking_session_info
                    SET 
                    parking_estimated_charge = ?,
                    parking_end_time = CURRENT_TIMESTAMP,
                    parking_actual_hours = ?, 
                    parking_savings = ?, 
                    update_datetime = CURRENT_TIMESTAMP
                    WHERE username = ?`;

    db.query(query, [almostSpent, hoursActual, savings, username], (err, results) => {
        if (err) {
            console.error("[Database Error] Failed to update session info", err);
            return res.status(500).send("Error updating session info");
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: "Session not found" });
        }

        return res.status(200).json({ message: "Session updated successfully" });
    });
});

app.delete('/delete-session/:sessionId', (req, res) => {
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
    console.log(`parkingsession-service is up! server is running on port ${PORT}`);
});