const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection({
    host: '10.96.188.212',
    user: 'host',
    password: 'ThriftParkDB',
    database: 'thriftpark',
    port: 3306
})

db.connect((err) =>{
    if (err){
        console.error('Error connecting to ThriftPark Database', err.stack);
        return;
    }
    console.log('Connected to ThiftPark Database successfully!');
})

app.post('/add-user', (req, res) => {
    const {
        username, 
        name, 
        password,
        vehicle_type,
        email,
        phone_number
    } = req.body;

    //check if the username or email already exists
    db.query("SELECT * FROM users WHERE username = ? OR email = ?", [username, email], (err, results) => {
        if (err) {
            console.error('[Database Error] Failed to check user existence', err);
            return res.status(500).send('Error checking user existence');
        }

        const usernameExists = results.some(user => user.username.toLowerCase() === username.toLowerCase());
        const emailExists = results.some(user => user.email === email);

        if (usernameExists && emailExists) {
            return res.status(400).json({ message: 'Username and email already exist.' });
        } else if (usernameExists) {
            return res.status(400).json({ message: 'Username already exists, please choose another one.' });
        } else if (emailExists) {
            return res.status(400).json({ message: 'Email already exists, please use another one.' });
        }

        //add new user
        const user = {
            username,
            name,
            password,
            vehicle_type,
            email,
            phone_number
        };

        db.query("INSERT INTO users SET ?", user, (err, results) => {
            if (err) {
                console.error('[Database Error] Failed to add new user', err);
                return res.status(500).json({ message: 'Error adding new user' });
            }
            return res.status(200).json({ 
                message: 'Added new user successfully!', 
                id: results.insertId 
            });
        });
    });
});

app.get('/get-all-users', (req, res) => {
    const query = `SELECT * FROM users`;
    db.query(query, (err,results) =>{
        if (err){
            console.error('[Database Error] Failed to retrieve all users');
            return res.status(500).send('Error retrieving all users');
        }
        return res.status(200).json({ message: 'Results returned', results})
    })
});

app.get('/get-user/:username', (req, res) => {
    const { username } = req.params;
    const query = `SELECT * FROM users WHERE username = ?`;

    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('[Database Error] Failed to retrieve the selected user', err);
            return res.status(500).send('Error retrieving the selected user');
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        return res.status(200).json({ message: 'Results returned', results });
    });
});

app.put('/edit-user/:username', (req, res) => {
    const { username } = req.params;
    const { name, password, vehicle_type, email, phone_number } = req.body;
    if (!name || !password || !vehicle_type || !email || !phone_number) {
        return res.status(400).json({ error: 'All fields (name, password, vehicle_type, email, phone_number) are required' });
    }
    const query = `
        UPDATE users 
        SET 
            name = ?, 
            password = ?, 
            vehicle_type = ?, 
            email = ?, 
            phone_number = ?, 
            update_datetime = CURRENT_TIMESTAMP
        WHERE username = ?`;

    db.query(query, [name, password, vehicle_type, email, phone_number, username], (err, results) => {
        if (err) {
            console.error('[Database Error] Failed to update user details', err);
            return res.status(500).send('Error updating user details');
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json({ message: 'User details updated successfully' });
    });
});

app.delete('/delete-user/:username', (req, res) => {
    const { username } = req.params;

    const query = `DELETE FROM users WHERE username = ?`;

    // Execute the query to delete the user
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error('[Database Error] Failed to delete user', err);
            return res.status(500).send('Error deleting user');
        }

        // Check if any rows were affected (meaning the user was found and deleted)
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json({ message: 'User deleted successfully' });
    });
});

app.listen(PORT, () => {
    console.log(`user-service is up! server is running on port ${PORT}`);
});