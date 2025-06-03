require('dotenv').config();

const { createBlueskySession, sendData } = require('./utils');
const https = require('https');
const url = require('url');

async function getBlueskyTrends(accessJwt) {
  if (!accessJwt) {
    return Promise.reject(new Error('Access JWT is required to get trends.'));
  }

  const options = {
    hostname: 'bsky.social',
    path: '/xrpc/app.bsky.unspecced.getTrends?limit=5',
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
            
            const mappedTrendsData = parsedData.trends ? parsedData.trends.map(trend => {
              return {
                displayName: trend.displayName,
                postCount: trend.postCount,
                startedAt: trend.startedAt,
                status: trend.status
              };
            }) : [];
            
            resolve({ ...parsedData, trends: mappedTrendsData });
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

async function main() {
  try {
    if (!process.env.TRMNL_CUSTOM_PLUGIN_TRENDS_WEBHOOK_URL) {
      console.log('TRMNL_CUSTOM_PLUGIN_TRENDS_WEBHOOK_URL environment variable is not defined. Exiting gracefully.');
      return;
    }

    const session = await createBlueskySession();
    console.log('Session created successfully:');
    console.log(JSON.stringify(session, null, 2));

    if (session && session.accessJwt) {
      const trendsResponse = await getBlueskyTrends(session.accessJwt);
      console.log('\nBluesky Trends:');
      console.log(JSON.stringify(trendsResponse, null, 2));

      const webhookResponse = await sendData({
        trends: trendsResponse.trends || []
      }, 'trends', process.env.TRMNL_CUSTOM_PLUGIN_TRENDS_WEBHOOK_URL);
      console.log('\nWebhook response:');
      console.log(`Status Code: ${webhookResponse.statusCode}`);
      console.log('Body:', JSON.stringify(webhookResponse.body, null, 2));

    } else {
      console.error('Failed to retrieve accessJwt from session.');
    }

  } catch (error) {
    console.error('An error occurred in main execution:', error.message);
  }
}

main();
