app.post('/registrations', async (req, res) => {
  const { event_id, program_id, name, email, ticket_count } = req.body;

  const eventCheck = await pool.query('SELECT seats_available FROM events WHERE event_id=$1', [event_id]);
  const currentSeats = eventCheck.rows[0]?.seats_available;

  if (currentSeats === undefined) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (ticket_count > currentSeats) {
    return res.status(400).json({ error: 'Not enough seats available' });
  }

  const result = await pool.query(
    'INSERT INTO registrations (event_id, program_id, name, email, ticket_count) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [event_id, program_id, name, email, ticket_count]
  );

  const newSeats = currentSeats - ticket_count;
  await pool.query('UPDATE events SET seats_available=$1 WHERE event_id=$2', [newSeats, event_id]);

  if (newSeats < 10) {
    const command = new InvokeCommand({
      FunctionName: 'new-event-low-seats',
      Payload: JSON.stringify({
        body: JSON.stringify({ event_id, seats_available: newSeats }),
      }),
    });
    await lambdaClient.send(command);
    console.log(`Low seats alert triggered for event ${event_id}`);
  }

  res.status(201).json(result.rows[0]);
});
