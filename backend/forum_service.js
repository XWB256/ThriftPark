const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();
const PORT = process.env.PORT || 3003;
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

app.post('/new-post', (req, res) =>
{
    const {
        combo_uuid,
        username,
        msg_subject,
        msg_content,
        like_count,
        reply_uuid
    } = req.body;

    const post = {
        combo_uuid,
        username,
        msg_subject,
        msg_content,
        like_count,
        reply_uuid : null
    };
    const query = "INSERT INTO forum SET ?";

    db.query(query, post, (err, result) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to create post", err);
            return res.status(500).json({ error: "Failed to add post" });
        }
        return res.status(200).json({ message: "post created successfully"});
    });
});


app.get('/get-all-posts', (req, res) =>{
    const query = `SELECT * FROM forum`;

    db.query(query, (err, result) => {
        if (err) {
            console.error("[Database Error] Failed to fetch posts", err);
            return res.status(500).json({ error: "Failed to fetch posts" });
        }
        return res.status(200).json(result);
    });
});

app.delete('/delete-post', (req, res) => {
  const { username, combo_uuid } = req.body;

  if (!username || !combo_uuid) {
    return res.status(400).json({ error: "Username and combo_uuid are required" });
  }

  const query = "DELETE FROM forum WHERE username = ? AND combo_uuid = ?";

  db.query(query, [username, combo_uuid], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to delete post", err);
      return res.status(500).json({ error: "Error deleting post" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ 
        error: "Post not found or you don't have permission to delete it" 
      });
    }

    return res.status(200).json({ message: "Post deleted successfully" });
  });
});

app.post('/reply-to-post', (req, res) =>
{
    const {
        combo_uuid,
        username,
        msg_subject,
        msg_content,
        like_count,
        reply_uuid
    } = req.body;

    const reply = {
        combo_uuid,
        username,
        msg_subject,
        msg_content,
        like_count,
        reply_uuid
    };
    const query = `INSERT INTO forum SET ?`;
    db.query(query, reply, (err, results) => {
        if (err) {
            console.error("[Database error] Failed to add reply to post", err);
            return res.status(500).json({ error: "Failed to add reply to post" });
        }
        return res.status(200).json({ message: "Reply added successfully" });
    });
});

app.put('/like-post', (req, res) =>
{
    const { combo_uuid } = req.body;

    const query = `
        UPDATE forum 
        SET like_count = like_count + 1
        WHERE combo_uuid = ?`;

    db.query(query, combo_uuid, (err, results) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to like post");
            return res.status(500).send("Error liking post");
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: "Post not found" });
        }

        return res.status(200).json({ message: "Liked post successfully" });
    });
});

app.put('/unlike-post', (req, res) =>
{
    const {combo_uuid} = req.body;
    const query = `
        UPDATE forum 
        SET like_count = like_count - 1
        WHERE combo_uuid = ?`;

    db.query(query, combo_uuid, (err, results) =>
    {
        if (err)
        {
            console.error("[Database Error] Failed to like post");
            return res.status(500).send("Error unliking post");
        }
        return res.status(200).json({ message: "removed like successfully"});
    });
});

app.put('/edit-post', (req, res) => {
  const { combo_uuid, username, new_content } = req.body;

  // Validate input
  if (!combo_uuid || !username || !new_content) {
    return res.status(400).json({ error: "combo_uuid, username, and new_content are required" });
  }

  // Update post content and set edited flag
  const query = `
    UPDATE forum
    SET msg_content = ?, edited = 1
    WHERE combo_uuid = ? AND username = ?
  `;

  db.query(query, [new_content, combo_uuid, username], (err, results) => {
    if (err) {
      console.error("[Database Error] Failed to edit post:", err);
      return res.status(500).json({ error: "Error editing post" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ 
        error: "Post not found or you don't have permission to edit it" 
      });
    }

    return res.status(200).json({ message: "Post edited successfully" });
  });
});

app.get('/get-post-with-replies/:combo_uuid', (req, res) => {
    const { combo_uuid } = req.params;
    
    const query = `
        SELECT * FROM forum 
        WHERE combo_uuid = ? OR reply_uuid = ?
        ORDER BY CASE WHEN reply_uuid IS NULL THEN 0 ELSE 1 END, combo_uuid
    `;
    
    db.query(query, [combo_uuid, combo_uuid], (err, results) => {
        if (err) {
            console.error("[Database Error]", err);
            return res.status(500).json({ error: "Failed to fetch post" });
        }
        return res.status(200).json(results);
    });
});

app.listen(PORT, () => {
    console.log(`forum-service is up! server is running on port ${PORT}`);
});