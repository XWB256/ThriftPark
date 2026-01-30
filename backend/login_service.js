const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3007;
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
    console.log('Connected to ThriftPark Database successfully!');
})

// Temporary in-memory store for OTPs
const otpStore = {};

// --- LOGIN ---
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: "Email and password are required",
    });
  }

  const query = `
    SELECT id, username, name, vehicle_type, email, phone_number
    FROM users
    WHERE email = ? AND password = ?`;

  db.query(query, [email, password], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to process login", err);
      return res.status(500).json({
        success: false,
        error: "Error processing login request",
      });
    }

    if (results.length === 0) {
      return res.status(401).json({
        success: false,
        error: "Invalid email or password",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: results[0],
    });
  });
});


// --- SEND OTP ---
app.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res.status(400).json({ success: false, error: "Email is required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore[email] = otp;
  console.log(`Generated OTP for ${email}: ${otp}`);

   // Configure email sender (use your SMTP)
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "noreply.thriftpark@gmail.com", // replace with actual email
      pass: "srau bife rjcv aqvq", // use app password
    },
  });

  // ✨ ThriftPark HTML Email Template ✨
  const htmlTemplate = `
    <div style="
      background-color: #000;
      color: #fff;
      font-family: 'Helvetica Neue', Arial, sans-serif;
      padding: 40px 20px;
      text-align: center;
    ">
      <div style="
        max-width: 480px;
        margin: auto;
        background-color: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 16px;
        padding: 30px;
      ">
        <h1 style="color: #fff; font-size: 28px; letter-spacing: 1px;">ThriftPark</h1>
        <p style="color: #aaa; font-size: 15px; margin-top: 10px;">
          Your one-stop platform for smart, affordable parking.
        </p>
        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 25px 0;">
        <h2 style="color: #fff; font-size: 22px; margin-bottom: 10px;">Your Login OTP</h2>
        <div style="
          display: inline-block;
          background: linear-gradient(135deg, #29ffe6, #9effa0);
          color: #000;
          padding: 12px 30px;
          font-size: 24px;
          font-weight: bold;
          border-radius: 12px;
          letter-spacing: 4px;
          margin: 20px 0;
        ">
          ${otp}
        </div>
        <p style="color: #ccc; font-size: 14px; margin-top: 15px;">
          This OTP will expire in <b>5 minutes</b>.<br>
          Please do not share it with anyone.
        </p>
        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 25px 0;">
        <p style="color: #777; font-size: 12px;">
          © 2025 ThriftPark. All rights reserved.<br>
          Smart Parking. Made Simple.
        </p>
      </div>
    </div>
  `;

  const mailOptions = {
    from: '"noreply.thriftpark@gmail.com>',
    to: email,
    subject: "Your ThriftPark Login OTP",
    html: htmlTemplate,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP email sent to:", email);
    res.status(200).json({ success: true, message: "OTP sent successfully" });

    // auto-expire OTP in 5 minutes
    setTimeout(() => delete otpStore[email], 5 * 60 * 1000);
  } catch (err) {
    console.error("Error sending OTP email:", err);
    res.status(500).json({ success: false, error: "Failed to send OTP email" });
  }
});


// --- VERIFY OTP ---
app.post("/verify-otp", (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp)
    return res.status(400).json({ success: false, error: "Missing fields" });

  if (otpStore[email] === otp) {
    delete otpStore[email];
    return res.status(200).json({ success: true, message: "OTP verified!" });
  } else {
    return res.status(401).json({ success: false, error: "Invalid OTP" });
  }
});

// check existence
app.post('/check-existence', (req, res) => {
    const {
        username, 
        email,
    } = req.body;

    //check if the username or email already exists
    db.query("SELECT * FROM users WHERE username = ? OR email = ?", [username, email], (err, results) => {
        if (err) {
            console.error('[Database Error] Failed to check user existence', err);
            return res.status(500).json({ message: 'Error checking user existence' });
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

        return res.status(200).json({ 
            message: 'Success! New user is unique!', 
            id: results.insertId 
        });
    
    });
});

// --- LOGOUT ---
app.post("/logout", (req, res) => {
  return res
    .status(200)
    .json({ success: true, message: "Logged out successfully" });
});


app.listen(PORT, () => {
    console.log(`login-service is up! server is running on port ${PORT}`);
});