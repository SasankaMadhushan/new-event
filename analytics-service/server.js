const express = require('express');

const app = express();
app.use(express.json());

const CLICKHOUSE_URL = 'http://clickhouse:8123';
const CLICKHOUSE_USER = 'metabase_user';
const CLICKHOUSE_PASSWORD = 'MetabasePass123';

app.post('/analytics', async (req, res) => {
  const { event_type, event_id, session_id, metadata } = req.body;

  const query = `
    INSERT INTO web_events (event_type, event_id, session_id, metadata)
    VALUES ('${event_type}', '${event_id}', '${session_id}', '${JSON.stringify(metadata || {})}')
  `;

  try {
    const response = await fetch(CLICKHOUSE_URL, {
      method: 'POST',
      body: query,
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${CLICKHOUSE_USER}:${CLICKHOUSE_PASSWORD}`).toString('base64'),
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ClickHouse error:', errorText);
      return res.status(500).json({ error: 'Failed to record event' });
    }

    res.status(201).json({ message: 'Event recorded' });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.listen(3000, () => console.log('Analytics service running on port 3000'));
// CI/CD test
