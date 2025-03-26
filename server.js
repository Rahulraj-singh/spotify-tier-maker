require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

// Spotify API credentials
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3000/callback';

// Routes
app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  res.cookie('spotify_auth_state', state);

  const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private';
  const queryParams = querystring.stringify({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: scope,
    redirect_uri: REDIRECT_URI,
    state: state
  });

  res.redirect(`https://accounts.spotify.com/authorize?${queryParams}`);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies.spotify_auth_state : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' + querystring.stringify({ error: 'state_mismatch' }));
  } else {
    res.clearCookie('spotify_auth_state');
    
    try {
      const authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        method: 'post',
        params: {
          code: code,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        },
        headers: {
          'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      };

      const response = await axios(authOptions);
      const { access_token, refresh_token, expires_in } = response.data;

      res.redirect('/#' + querystring.stringify({
        access_token: access_token,
        refresh_token: refresh_token
      }));
    } catch (error) {
      res.redirect('/#' + querystring.stringify({ error: 'invalid_token' }));
    }
  }
});

app.get('/refresh_token', async (req, res) => {
  const { refresh_token } = req.query;

  try {
    const response = await axios({
      url: 'https://accounts.spotify.com/api/token',
      method: 'post',
      params: {
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      },
      headers: {
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    res.send(response.data);
  } catch (error) {
    res.status(400).send({ error: 'Failed to refresh token' });
  }
});

app.get('/search', async (req, res) => {
  const { q, access_token } = req.query;
  
  if (!access_token) {
    return res.status(401).send({ error: 'No access token provided' });
  }

  try {
    const [tracksResponse, albumsResponse] = await Promise.all([
      axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }),
      axios.get(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=5`, {
        headers: { 'Authorization': `Bearer ${access_token}` }
      })
    ]);

    const tracks = tracksResponse.data.tracks.items.map(track => ({
      id: track.id,
      name: track.name,
      artists: track.artists,
      album: {
        name: track.album.name,
        images: track.album.images
      },
      duration_ms: track.duration_ms,
      uri: track.uri
    }));

    const albums = albumsResponse.data.albums.items.map(album => ({
      id: album.id,
      name: album.name,
      artists: album.artists,
      images: album.images,
      total_tracks: album.total_tracks
    }));

    res.send({ tracks, albums });
  } catch (error) {
    console.error('Search error:', error.response?.data || error.message);
    res.status(500).send({ error: 'Failed to search' });
  }
});

app.get('/album-details', async (req, res) => {
  const { album_id, access_token } = req.query;
  
  if (!access_token) {
    return res.status(401).send({ error: 'No access token provided' });
  }

  try {
    const response = await axios.get(`https://api.spotify.com/v1/albums/${album_id}`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const album = {
      id: response.data.id,
      name: response.data.name,
      artists: response.data.artists,
      images: response.data.images,
      total_tracks: response.data.total_tracks
    };

    res.send(album);
  } catch (error) {
    console.error('Album details error:', error.response?.data || error.message);
    res.status(500).send({ error: 'Failed to get album details' });
  }
});

app.get('/album-tracks', async (req, res) => {
  const { album_id, access_token } = req.query;
  
  if (!access_token) {
    return res.status(401).send({ error: 'No access token provided' });
  }

  try {
    const response = await axios.get(`https://api.spotify.com/v1/albums/${album_id}/tracks`, {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const tracks = response.data.items.map(track => ({
      id: track.id,
      name: track.name,
      artists: track.artists,
      duration_ms: track.duration_ms,
      uri: track.uri
    }));

    res.send(tracks);
  } catch (error) {
    console.error('Album tracks error:', error.response?.data || error.message);
    res.status(500).send({ error: 'Failed to get album tracks' });
  }
});

app.post('/create-playlist', async (req, res) => {
  const { access_token, name, tracks } = req.body;
  
  if (!access_token) {
    return res.status(401).send({ error: 'No access token provided' });
  }

  try {
    // Get user ID
    const userResponse = await axios.get('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });
    const userId = userResponse.data.id;

    // Create playlist
    const playlistResponse = await axios.post(
      `https://api.spotify.com/v1/users/${userId}/playlists`,
      {
        name: name,
        description: 'Created with Spotify Tier Maker',
        public: true
      },
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );

    const playlistId = playlistResponse.data.id;

    // Add tracks to playlist
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      {
        uris: tracks
      },
      {
        headers: { 'Authorization': `Bearer ${access_token}` }
      }
    );

    res.send({
      success: true,
      url: playlistResponse.data.external_urls.spotify
    });
  } catch (error) {
    console.error('Create playlist error:', error.response?.data || error.message);
    res.status(500).send({ 
      success: false,
      error: error.response?.data?.error?.message || 'Failed to create playlist'
    });
  }
});

// Helper function
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});