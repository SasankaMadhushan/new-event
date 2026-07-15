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

app.get('/programs', async (req, res) => {
  const result = await pool.query('SELECT * FROM programs');
  res.json(result.rows);
});

app.get('/programs/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM programs WHERE program_id=$1', [req.params.id]);
  res.json(result.rows[0]);
});

app.listen(3000, () => console.log('Program service running on port 3000'));
