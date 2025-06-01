require('dotenv').config();

const { createBlueskySession, sendData } = require('./utils');
const https = require('https');
const url = require('url');

async function getBlueskyTimeline(accessJwt) {
  if (!accessJwt) {
    return Promise.reject(new Error('Access JWT is required to get timeline.'));
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
            const filteredTimeline = parsedData.feed
              .filter(item => {
                if (item.post?.record?.$type === 'app.bsky.feed.post' && item.post.record.reply) {
                  return false;
                }

                if (item.reason?.$type === 'app.bsky.feed.defs#reasonRepost') {
                  return false;
                }

                if (item.post?.embed || item.post?.record?.embed) {
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
            resolve({ timeline: filteredTimeline });
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
    if (!process.env.TRMNL_CUSTOM_PLUGIN_TIMELINE_WEBHOOK_URL) {
      console.log('TRMNL_CUSTOM_PLUGIN_TIMELINE_WEBHOOK_URL environment variable is not defined. Exiting gracefully.');
      return;
    }

    const session = await createBlueskySession();
    console.log('Session created successfully:');
    console.log(JSON.stringify(session, null, 2));

    if (session && session.accessJwt) {
      const timelineResponse = await getBlueskyTimeline(session.accessJwt);
      console.log('\nBluesky Timeline:');
      console.log(JSON.stringify(timelineResponse, null, 2));

      const webhookResponse = await sendData({
        timeline: timelineResponse.timeline || []
      }, 'timeline', process.env.TRMNL_CUSTOM_PLUGIN_TIMELINE_WEBHOOK_URL);
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