const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3004;
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: '10.96.188.212',
    user: 'host',
    password: 'ThriftParkDB',
    database: 'thriftpark',
    port: 3306
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to ThriftPark Database', err.stack);
        return;
    }
    console.log('Connected to ThiftPark Database successfully!');
});

/** 
 * POST /calculate-cost 
 * Request body: { carpark_price: number, parking_time: number } 
 * Response: { cost: number } 
 * */
app.post('/calculate-cost', (req, res) => {
    const { carpark_price, parking_time } = req.body;

    if (carpark_price == null || parking_time == null) {
        return res.status(400).json({ error: 'Missing carpark_price or parking_time' });
    }

    const cost = carpark_price * parking_time;
    res.json({ cost });

    // const sql = 'INSERT INTO parking_records (carpark_price, parking_time, total_cost) VALUES (?, ?, ?)'; 
    // db.query(sql, [carpark_price, parking_time, cost], (err, result) => { 
    // if (err) { 
    //  console.error('Database insert error:', err); 
    //  return res.status(500).json({ error: 'Database error' }); 
    // } 
    // console.log('Record inserted:', result.insertId); 
    // });


});

// Session Management API

let clients = [];

/**
 * GET /session-events
 */
app.get('/session-events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const clientId = Date.now();
    clients.push(res);
    console.log(`Client ${clientId} connected. Total clients: ${clients.length}`);

    req.on('close', () => {
        clients = clients.filter(c => c !== res);
        console.log(`Client ${clientId} disconnected.`);
    });
});

/**
 * POST /start-session
 * Request body: { starting_time: string(ISO, e.g. "2025-10-17T15:00:00Z"), parking_time: number(minutes) }
 */
app.post('/start-session', (req, res) => {
    const { starting_time, parking_time } = req.body;

    if (!starting_time || !parking_time) {
        return res.status(400).json({ error: 'Missing starting_time or parking_time' });
    }

    const start = new Date(starting_time);
    const end = new Date(start.getTime() + parking_time * 60 * 1000);
    const now = new Date();

    const timeUntilEnd = end - now;

    if (timeUntilEnd <= 0) {
        return res.status(400).json({ error: 'Invalid time: parking already ended' });
    }

    const tenMinBefore = timeUntilEnd - 10 * 60 * 1000;
    const fiveMinBefore = timeUntilEnd - 5 * 60 * 1000;

    console.log(`Parking session started. Ends at ${end.toLocaleTimeString()}`);
    res.json({ message: 'Session started successfully', end_time: end });

    //alert 10 mins before end
    if (tenMinBefore > 0) {
        setTimeout(() => {
            broadcastEvent('Parking will end in 10 minutes.');
        }, tenMinBefore);
    }

    //alert 5 mins before end
    if (fiveMinBefore > 0) {
        setTimeout(() => {
            broadcastEvent('Parking will end in 5 minutes.');
        }, fiveMinBefore);
    }
});


function broadcastEvent(message) {
    clients.forEach(client => {
        client.write(`data: ${JSON.stringify({ message })}\n\n`);
    });
    console.log(`Sent reminder: ${message}`);
}

// codes for frontend
/*

useEffect(() => {
    const eventSource = new EventSource("http://localhost:3004/session-events");
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessage(data.message);
    };

    return () => eventSource.close();
  }, []);

*/



// ===============================
app.listen(PORT, () => {
    console.log(`general-service is up! server is running on port ${PORT}`);
});
