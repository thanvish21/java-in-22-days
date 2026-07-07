const https = require('https');

const apiKey = process.env.OPENROUTER_API_KEY || "YOUR_KEY_HERE"; // We'll just test if the endpoint itself rejects the model string

const data = JSON.stringify({
  model: "google/gemini-pro",
  messages: [{role: "user", content: "hi"}]
});

const options = {
  hostname: 'openrouter.ai',
  path: '/api/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.write(data);
req.end();
