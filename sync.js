require('dotenv').config();

const https = require('https');
const url = require('url');

async function createBlueskySession() {
  const identifier = process.env.BSKY_IDENTIFIER;
  const appPassword = process.env.BSKY_APP_PASSWORD;

  if (!identifier || !appPassword) {
    console.error('Error: BSKY_IDENTIFIER and BSKY_APP_PASSWORD environment variables must be set.');
    process.exit(1);
  }

  const postData = JSON.stringify({
    identifier: identifier,
    password: appPassword,
  });

  const options = {
    hostname: 'bsky.social',
    path: '/xrpc/com.atproto.server.createSession',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } else {
            let errorMsg = `HTTP error! status: ${res.statusCode}`;
            try {
              const errorDetails = JSON.parse(rawData);
              errorMsg += ` - ${errorDetails.error || ''}: ${errorDetails.message || rawData}`;
            } catch (e) {
              errorMsg += ` - Unable to parse error response: ${rawData}`;
            }
            reject(new Error(errorMsg));
          }
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}. Raw data: ${rawData}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Problem with request: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

async function getBlueskyTrends(accessJwt) {
  if (!accessJwt) {
    return Promise.reject(new Error('Access JWT is required to get trends.'));
  }

  const options = {
    hostname: 'bsky.social',
    path: '/xrpc/app.bsky.unspecced.getTrends?limit=6',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessJwt}`,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsedData = JSON.parse(rawData);
            resolve(parsedData);
          } else {
            let errorMsg = `HTTP error! status: ${res.statusCode}`;
            try {
              const errorDetails = JSON.parse(rawData);
              errorMsg += ` - ${errorDetails.error || ''}: ${errorDetails.message || rawData}`;
            } catch (e) {
              errorMsg += ` - Unable to parse error response: ${rawData}`;
            }
            reject(new Error(errorMsg));
          }
        } catch (e) {
          reject(new Error(`Failed to parse JSON response: ${e.message}. Raw data: ${rawData}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Problem with request: ${e.message}`));
    });

    req.end();
  });
}

async function sendTrendsToWebhook(trendsData) {
  const webhookUrl = process.env.TRMNL_CUSTOM_PLUGIN_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('Error: TRMNL_CUSTOM_PLUGIN_WEBHOOK_URL environment variable must be set.');
    process.exit(1);
  }

  if (!trendsData) {
    return Promise.reject(new Error('Trends data is required to send to webhook.'));
  }

  const parsedUrl = url.parse(webhookUrl);

  const postData = JSON.stringify({
    merge_variables: {
        trends: trendsData
    }
  });

  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + (parsedUrl.search || ''),
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let rawData = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {

            if (res.statusCode >= 200 && res.statusCode < 300) {
            let responseData = rawData;
            try {
                responseData = JSON.parse(rawData);
            } catch (e) {
                console.log('Webhook response was not JSON, or empty. Status:', res.statusCode);
            }
            resolve({ statusCode: res.statusCode, body: responseData });
          } else {
            let errorMsg = `Webhook HTTP error! status: ${res.statusCode}`;
            try {
              const errorDetails = JSON.parse(rawData);
              errorMsg += ` - ${errorDetails.error || ''}: ${errorDetails.message || rawData}`;
            } catch (e) {
              errorMsg += ` - Unable to parse error response: ${rawData}`;
            }
            reject(new Error(errorMsg));
          }
        } catch (e) {
          reject(new Error(`Failed to process webhook response: ${e.message}. Raw data: ${rawData}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Problem with webhook request: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  try {
    const session = await createBlueskySession();
    console.log('Session created successfully:');
    console.log(JSON.stringify(session, null, 2));

    if (session && session.accessJwt) {
      const trends = await getBlueskyTrends(session.accessJwt);
      console.log('\nBluesky Trends:');
      console.log(JSON.stringify(trends, null, 2));

      if (trends) {
        const webhookResponse = await sendTrendsToWebhook(trends);
        console.log('\nWebhook response:');
        console.log(`Status Code: ${webhookResponse.statusCode}`);
        console.log('Body:', JSON.stringify(webhookResponse.body, null, 2));
      } else {
        console.error('No trends data to send to webhook.');
      }

    } else {
      console.error('Failed to retrieve accessJwt from session.');
    }

  } catch (error) {
    console.error('An error occurred in main execution:', error.message);
  }
}

main();
