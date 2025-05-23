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

async function getBlueskyPosts(accessJwt) {
  if (!accessJwt) {
    return Promise.reject(new Error('Access JWT is required to get posts.'));
  }

  const options = {
    hostname: 'bsky.social',
    path: '/xrpc/app.bsky.feed.getTimeline?limit=100',
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
            
            const filteredPosts = parsedData.feed
              .filter(item => {
                if (item.post.record.$type === 'app.bsky.feed.post' && 
                    item.post.record.reply) {
                  return false;
                }
                
                if (item.reason && item.reason.$type === 'app.bsky.feed.defs#reasonRepost') {
                  return false;
                }
                
                if (item.post.embed && 
                   (item.post.embed.$type === 'app.bsky.embed.images#view' || 
                    (item.post.record.embed && item.post.record.embed.$type === 'app.bsky.embed.images'))) {
                  return false;
                }
                
                if ((item.post.embed && item.post.embed.$type === 'app.bsky.embed.external#view') ||
                    (item.post.record.embed && item.post.record.embed.$type === 'app.bsky.embed.external')) {
                  return false;
                }
                
                return true;
              })
              .map(item => {
                return {
                  authorName: item.post.author.displayName || item.post.author.handle,
                  authorAvatar: item.post.author.avatar,
                  text: item.post.record.text,
                  likeCount: item.post.likeCount,
                  repostCount: item.post.repostCount,
                  commentCount: item.post.replyCount
                };
              });
            
            resolve({
              posts: filteredPosts
            });
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

async function sendData(data) {
  const webhookUrl = process.env.TRMNL_CUSTOM_PLUGIN_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('Error: TRMNL_CUSTOM_PLUGIN_WEBHOOK_URL environment variable must be set.');
    process.exit(1);
  }

  if (!data) {
    return Promise.reject(new Error('Data is required to send to webhook.'));
  }

  const parsedUrl = url.parse(webhookUrl);

  const postData = JSON.stringify({
    merge_variables: {
      trends: data.trends || [],
      posts: data.posts || []
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
      const trendsResponse = await getBlueskyTrends(session.accessJwt);
      console.log('\nBluesky Trends:');
      console.log(JSON.stringify(trendsResponse, null, 2));

      const postsResponse = await getBlueskyPosts(session.accessJwt);
      console.log('\nBluesky Posts:');
      console.log(JSON.stringify(postsResponse, null, 2));

      const webhookResponse = await sendData({
        trends: trendsResponse.trends || [],
        posts: postsResponse.posts || []
      });
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
