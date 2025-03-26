import dotenv from 'dotenv';
import express from 'express';
import axios from 'axios';
import cors from 'cors';
import { stringify } from 'querystring';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import path from 'path';

// Configuration
dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Spotify OAuth Endpoints
app.get('/login', (req, res) => {
  try {
    const state = generateRandomString(16);
    res.cookie('spotify_auth_state', state, { 
      httpOnly: true,
      sameSite: 'lax'
    });

    const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('client_id', process.env.SPOTIFY_CLIENT_ID);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('redirect_uri', process.env.REDIRECT_URI);
    authUrl.searchParams.append('state', state);
    // (Optionally, add PKCE parameters if needed)
    console.log('Redirecting to:', authUrl.toString());
    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Authentication error');
  }
});

app.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const storedState = req.cookies?.spotify_auth_state;

    if (error) throw new Error(`Spotify error: ${error}`);
    if (!state || !storedState || state !== storedState) {
      throw new Error('State mismatch');
    }

    const authHeader = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI
      }),
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token } = response.data;
    // Redirect back to client with tokens in URL hash
    res.redirect(`/#access_token=${access_token}&refresh_token=${refresh_token}`);
    
  } catch (error) {
    console.error('Callback error:', error.message);
    res.redirect(`/#error=${encodeURIComponent(error.message)}`);
  }
});

// Global Search Endpoint: returns both tracks and albums
app.get('/search', async (req, res) => {
  try {
    const { q, access_token } = req.query;

    const [tracks, albums] = await Promise.all([
      axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`, {
        headers: { Authorization: `Bearer ${access_token}` }
      }),
      axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=5`, {
        headers: { Authorization: `Bearer ${access_token}` }
      })
    ]);

    res.json({
      tracks: tracks.data.tracks.items,
      albums: albums.data.albums.items
    });

  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to fetch album tracks
app.get('/album-tracks', async (req, res) => {
  try {
    spotifyApi.setAccessToken(req.query.access_token);
    const albumId = req.query.album_id;
    const results = await axios.get(`https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50`, {
      headers: { Authorization: `Bearer ${req.query.access_token}` }
    });
    res.json(results.data.items);
  } catch (error) {
    console.error('Album tracks error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Create Playlist Endpoint (for saving tiers)
app.post('/create-playlist', async (req, res) => {
  try {
    const { access_token, name, tracks } = req.body;
    // Set access token for Spotify API requests
    // We use axios directly here
    const meResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    const userId = meResponse.data.id;
    
    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name: name || 'My Tier List',
        description: 'Created with Spotify Tier Maker',
        public: false
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (tracks.length > 0) {
      await axios.post(
        `https://api.spotify.com/v1/playlists/${playlistResponse.data.id}/tracks`,
        { uris: tracks },
        {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }
    
    res.json({ success: true, url: playlistResponse.data.external_urls.spotify });
  } catch (err) {
    console.error('Playlist creation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Utility
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});
