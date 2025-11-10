const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const axios = require('axios');
const admin = require("firebase-admin");
const app = express();
app.use(express.json());
const env = require('dotenv');
env.config();

admin.initializeApp({
  credential: admin.credential.cert(getFirebaseServiceAccount()),
  databaseURL: "https://digi-asset-managment-default-rtdb.firebaseio.com/"
});


const db = admin.database();


// Path to your service account key
const PROJECT_ID = 'digi-asset-managment'; // replace with your Firebase project ID

// Generate Google OAuth2 access token for FCM
async function getAccessToken() {
  const auth = new GoogleAuth({
    credentials: getFirebaseServiceAccount(),
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  const client = await auth.getClient();
  const accessTokenResponse = await client.getAccessToken();
  return accessTokenResponse.token;
}

// Send FCM notification
async function sendNotification(tokenKey, token, data = {}) {
  try {
    // ✅ Destructure title, body, and remaining keys from passed data (not req.body)
    const { title, body, ...extraData } = data;

    const accessToken = await getAccessToken();

    const message = {
      message: {
        token: token,
        data: {
          title: `${title || "Alert"} 🚨`,
          body: body || "",
          type: "alert",
          ...extraData, // 👈 merges all other key-value pairs (e.g., TPLNR: "1710")
        },
        android: {
          priority: "high",
        },
      },
    };

    console.log("Sending message:", JSON.stringify(message, null, 2));

    const response = await axios.post(
      `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
      message,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ FCM Response:", response.data);
    return response.data;

  } catch (error) {
    console.error(
      "❌ Error sending FCM notification:",
      error.response ? error.response.data : error.message
    );
    deleteToken(tokenKey); // Optional: handle invalid tokens
  }
}


async function deleteToken(tokenKey){
  const ref = db.ref("fcmTokens").child(tokenKey);
  await ref.remove();
}





// ✅ POST endpoint to send notification
app.post('/send', async (req, res) => {
  try {
    const data = req.body || {};

    const snapshot = await db.ref("fcmTokens").get();
    if (!snapshot.exists()) {
      return res.status(404).json({ error: "❌ No tokens found" });
    }

    const tokensObj = snapshot.val();
    const tokens = Object.values(tokensObj);
    const keys = Object.keys(tokensObj);

    for (let i = 0; i < tokens.length; i++) {
      // 👇 Pass the necessary info only
      await sendNotification(keys[i], tokens[i], data);
    }

    res.json({ status: true, message: "✅ Successfully sent" });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ error: "Failed to send notification" });
  }
});


// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 FCM server running at http://localhost:${PORT}`);
});

function getFirebaseServiceAccount() {
  return {
    type: process.env.type,
    project_id: process.env.project_id,
    private_key_id: process.env.private_key_id,
    private_key: process.env.private_key.replace(/\\n/g, '\n'),
    client_email: process.env.client_email,
    client_id: process.env.client_id,
    auth_uri: process.env.auth_uri,
    token_uri: process.env.token_uri,
    auth_provider_x509_cert_url: process.env.auth_provider_x509_cert_url,
    client_x509_cert_url: process.env.client_x509_cert_url,
    universe_domain: process.env.universe_domain,
  };
}