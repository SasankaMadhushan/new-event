const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

app.get('/events', async (req, res) => {
  const result = await pool.query('SELECT * FROM events');
  res.json(result.rows);
});

app.get('/events/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM events WHERE event_id=$1', [req.params.id]);
  res.json(result.rows[0]);
});

app.listen(3000, () => console.log('Event service running on port 3000'));
// CI/CD test trigger
// fresh CI/CD verification
