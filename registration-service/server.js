const express = require('express');
const { Pool } = require('pg');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

const lambdaClient = new LambdaClient({ region: 'us-east-2' });

app.get('/registrations', async (req, res) => {
  const result = await pool.query('SELECT * FROM registrations');
  res.json(result.rows);
});

app.post('/registrations', async (req, res) => {
  const { event_id, name, email, ticket_count } = req.body;

  const result = await pool.query(
    'INSERT INTO registrations (event_id, name, email, ticket_count) VALUES ($1, $2, $3, $4) RETURNING *',
    [event_id, name, email, ticket_count]
  );

  const eventResult = await pool.query('SELECT seats_available FROM events WHERE event_id=$1', [event_id]);
  const seatsAvailable = eventResult.rows[0]?.seats_available;

  if (seatsAvailable !== undefined && seatsAvailable < 10) {
    const command = new InvokeCommand({
      FunctionName: 'new-event-low-seats',
      Payload: JSON.stringify({
        body: JSON.stringify({ event_id, seats_available: seatsAvailable }),
      }),
    });
    await lambdaClient.send(command);
    console.log(`Low seats alert triggered for event ${event_id}`);
  }

  res.status(201).json(result.rows[0]);
});

app.listen(3000, () => console.log('Registration service running on port 3000'));
// CI/CD test
// fresh CI/CD verification
