// Spotify Tier Maker - Complete Client-Side Code with Authentication
document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const loginBtn = document.getElementById('spotify-login-btn');
  const mainLoginBtn = document.getElementById('main-login-btn');
  const searchInput = document.getElementById('search-input');
  const songResults = document.getElementById('song-results');
  const albumResults = document.getElementById('album-results');
  const lobby = document.getElementById('lobby');
  const tierList = document.getElementById('tier-list');
  const saveTierlistBtn = document.getElementById('save-tierlist');
  const selectAllLobbyBtn = document.getElementById('select-all-lobby');
  const clearLobbyBtn = document.getElementById('clear-lobby');
  const addTierBtn = document.getElementById('add-tier');
  const userProfileEl = document.getElementById('user-profile'); // element to display user info

  // State
  let accessToken = null;
  let currentTrackSource = 'global';
  let allTracks = [];

  // Initialize
  checkAuth();
  setupEventListeners();
  initializeDragAndDrop();

  // Functions
  function checkAuth() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    
    if (params.has('access_token')) {
      accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      localStorage.setItem('spotify_access_token', accessToken);
      localStorage.setItem('spotify_refresh_token', refreshToken);
      window.history.replaceState({}, document.title, window.location.pathname);
      showBuilderUI();
      fetchUserProfile(accessToken);
    } else {
      accessToken = localStorage.getItem('spotify_access_token');
      if (accessToken) {
        showBuilderUI();
        fetchUserProfile(accessToken);
      }
    }
  }

  function showBuilderUI() {
    document.querySelector('.initial-state').style.display = 'none';
    document.querySelector('.builder-container').style.display = 'grid';
  }

  function setupEventListeners() {
    // Authentication
    if (loginBtn) loginBtn.addEventListener('click', login);
    if (mainLoginBtn) mainLoginBtn.addEventListener('click', login);
    
    // Search
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    
    // Lobby
    selectAllLobbyBtn.addEventListener('click', selectAllInLobby);
    clearLobbyBtn.addEventListener('click', clearLobby);
    
    // Tier Management
    addTierBtn.addEventListener('click', addNewTier);
    saveTierlistBtn.addEventListener('click', showSaveModal);
  }

  function login() {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    window.location.href = '/login';
  }

  async function fetchUserProfile(token) {
    try {
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const userData = await response.json();
      console.log('User Profile:', userData);
      if (userProfileEl) {
        userProfileEl.textContent = `Logged in as: ${userData.display_name} (${userData.email})`;
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
    }
  }

  async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) {
      songResults.innerHTML = '';
      albumResults.innerHTML = '';
      return;
    }

    try {
      const response = await fetch(`/search?q=${encodeURIComponent(query)}&access_token=${accessToken}`);
      const data = await response.json();
      allTracks = data.tracks;
      renderSongResults(data.tracks);
      renderAlbumResults(data.albums);
    } catch (error) {
      console.error('Search error:', error);
      showNotification('Failed to search tracks', true);
    }
  }

  function renderSongResults(tracks) {
    songResults.innerHTML = '';
    if (tracks.length === 0) {
      songResults.innerHTML = '<div class="no-results"><i class="fas fa-search"></i><p>No songs found</p></div>';
      return;
    }
    tracks.forEach(track => {
      const trackElement = createTrackElement(track);
      songResults.appendChild(trackElement);
    });
  }

  function renderAlbumResults(albums) {
    albumResults.innerHTML = '';
    if (albums.length === 0) return;
    albums.forEach(album => {
      const albumElement = createAlbumElement(album);
      albumResults.appendChild(albumElement);
    });
  }

  function createTrackElement(track) {
    const trackTemplate = document.getElementById('track-template');
    const trackElement = trackTemplate.content.cloneNode(true);
    const container = trackElement.querySelector('.track');
    
    container.dataset.id = track.id;
    container.dataset.uri = track.uri;
    
    const artEl = trackElement.querySelector('.track-art');
    artEl.src = track.album?.images?.[0]?.url || 'https://via.placeholder.com/80?text=No+Image';
    artEl.alt = track.album?.name || 'Unknown Album';
  
    trackElement.querySelector('.track-title').textContent = track.name || 'Unknown Track';
    trackElement.querySelector('.track-artist').textContent = 
      track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
    
    const duration = track.duration_ms ? formatDuration(track.duration_ms) : '0:00';
    trackElement.querySelector('.track-duration').textContent = duration;
  
    trackElement.querySelector('.track-select').addEventListener('click', () => toggleTrackSelection(container));
    trackElement.querySelector('.add').addEventListener('click', () => showTierModal(track));
  
    return trackElement;
  }

  function createAlbumElement(album) {
    const albumTemplate = document.getElementById('album-template');
    const albumElement = albumTemplate.content.cloneNode(true);
    const albumContainer = albumElement.querySelector('.album');
    albumContainer.dataset.id = album.id;
    
    const albumArt = albumElement.querySelector('.album-art');
    albumArt.src = album.images[0]?.url || 'https://via.placeholder.com/80';
    albumArt.alt = album.name;
    albumElement.querySelector('.album-title').textContent = album.name;
    
    const artistText = album.artists.map(a => a.name).join(', ');
    const trackCount = album.total_tracks || '?';
    albumElement.querySelector('.album-artist').textContent = `${artistText} • ${trackCount} tracks`;
    
    albumElement.querySelector('.add-album').addEventListener('click', () => addAlbumToLobby(album));
    
    return albumElement;
  }

  function toggleTrackSelection(trackElement) {
    const icon = trackElement.querySelector('.track-select i');
    if (icon.classList.contains('fa-square')) {
      icon.classList.remove('fa-square');
      icon.classList.add('fa-check-square');
      addToLobby(trackElement);
    } else {
      icon.classList.remove('fa-check-square');
      icon.classList.add('fa-square');
      removeFromLobby(trackElement);
    }
  }

  function addToLobby(trackElement) {
    const existingTrack = lobby.querySelector(`[data-id="${trackElement.dataset.id}"]`);
    if (!existingTrack) {
      const clone = trackElement.cloneNode(true);
      lobby.appendChild(clone);
      const addBtn = clone.querySelector('.add');
      addBtn.innerHTML = '<i class="fas fa-layer-group"></i> Tier';
      addBtn.addEventListener('click', () => showTierModal(
        allTracks.find(t => t.id === trackElement.dataset.id),
        clone
      ));
    }
  }

  function removeFromLobby(trackElement) {
    const lobbyTrack = lobby.querySelector(`[data-id="${trackElement.dataset.id}"]`);
    if (lobbyTrack) {
      lobbyTrack.remove();
    }
  }

  async function addAlbumToLobby(album) {
    const albumElement = albumResults.querySelector(`[data-id="${album.id}"]`);
    const addButton = albumElement?.querySelector('.add-album');
    
    try {
      if (addButton) {
        addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        addButton.disabled = true;
      }

      const response = await fetch(`/album-tracks?album_id=${album.id}&access_token=${accessToken}`);
      const tracks = await response.json();

      const processedTracks = tracks.map(track => ({
        ...track,
        album: {
          name: album.name,
          images: album.images,
          ...track.album
        }
      }));

      processedTracks.forEach(track => {
        const existingTrack = lobby.querySelector(`[data-id="${track.id}"]`) ||
                              document.querySelector(`.tier-track[data-id="${track.id}"]`);
        if (!existingTrack) {
          const trackElement = createTrackElement(track);
          lobby.appendChild(trackElement);
        }
      });

      showNotification(`Added ${processedTracks.length} tracks from "${album.name}"`);

      if (albumElement) {
        albumElement.remove();
      }
    } catch (error) {
      console.error('Album add error:', error);
      showNotification('Failed to add album tracks', true);
    } finally {
      if (addButton) {
        addButton.innerHTML = '<i class="fas fa-plus"></i> Add Album';
        addButton.disabled = false;
      }
    }
  }

  function selectAllInLobby() {
    const tracks = songResults.querySelectorAll('.track');
    tracks.forEach(track => {
      const icon = track.querySelector('.track-select i');
      if (icon.classList.contains('fa-square')) {
        icon.classList.remove('fa-square');
        icon.classList.add('fa-check-square');
        addToLobby(track);
      }
    });
  }

  function clearLobby() {
    while (lobby.firstChild) {
      const track = lobby.firstChild;
      const originalTrack = songResults.querySelector(`[data-id="${track.dataset.id}"]`);
      if (originalTrack) {
        const icon = originalTrack.querySelector('.track-select i');
        icon.classList.remove('fa-check-square');
        icon.classList.add('fa-square');
      }
      track.remove();
    }
  }

  function showTierModal(track, trackElement) {
    const tierSelect = document.getElementById('tier-select');
    tierSelect.innerHTML = '';
    const tiers = Array.from(document.querySelectorAll('.tier')).map(t => ({
      element: t,
      letter: t.querySelector('.tier-name').value.toUpperCase()
    }));
    tiers.forEach(tier => {
      const option = document.createElement('option');
      option.value = tier.letter;
      option.textContent = `Tier ${tier.letter}`;
      tierSelect.appendChild(option);
    });
    document.getElementById('tier-modal').style.display = 'block';
    document.getElementById('modal-confirm').onclick = () => {
      const selectedTier = tierSelect.value;
      const tier = tiers.find(t => t.letter === selectedTier);
      if (tier) {
        addTrackToTier(track, tier.element);
      }
      closeModal();
      if (trackElement && trackElement.parentElement === lobby) {
        trackElement.remove();
      }
    };
  }

  function addTrackToTier(track, tierElement) {
    const existingTrack = document.querySelector(`.tier-track[data-id="${track.id}"]`);
    if (existingTrack) {
      showNotification('This track is already in a tier', true);
      return;
    }
    const tierTrack = createTierTrackElement(track);
    const tierContent = tierElement.querySelector('.tier-content');
    tierContent.appendChild(tierTrack);
  }

  function createTierTrackElement(track) {
    const element = document.createElement('div');
    element.className = 'tier-track';
    element.dataset.id = track.id;
    element.dataset.uri = track.uri;
    element.innerHTML = `
      <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/300'}" 
           alt="${track.name}" loading="lazy">
      <div class="tier-track-info">
        <div class="tier-track-title">${track.name}</div>
      </div>
      <div class="tier-track-remove" title="Remove from tier">
        <i class="fas fa-times"></i>
      </div>
    `;
    element.querySelector('.tier-track-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      element.remove();
    });
    return element;
  }

  function addNewTier(letter = null) {
    const tierTemplate = document.getElementById('tier-template');
    const tierElement = tierTemplate.content.cloneNode(true);
    const tierContainer = tierElement.querySelector('.tier');
    const tierNameInput = tierElement.querySelector('.tier-name');
    if (letter) {
      tierNameInput.value = letter;
    }
    const upBtn = tierContainer.querySelector('.up');
    const downBtn = tierContainer.querySelector('.down');
    const deleteBtn = tierContainer.querySelector('.delete');
    upBtn.addEventListener('click', () => moveTierUp(tierContainer));
    downBtn.addEventListener('click', () => moveTierDown(tierContainer));
    deleteBtn.addEventListener('click', () => deleteTier(tierContainer));
    const tierContent = tierContainer.querySelector('.tier-content');
    tierContent.style.overflowY = 'auto';
    tierContent.style.maxHeight = '300px';
    new Sortable(tierContent, {
      group: 'shared',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onAdd: (evt) => {
        const trackId = evt.item.dataset.id;
        const track = allTracks.find(t => t.id === trackId);
        if (track) {
          const newElement = createTierTrackElement(track);
          evt.to.insertBefore(newElement, evt.item);
          evt.item.remove();
        }
      }
    });
    tierList.appendChild(tierContainer);
  }

  function moveTierUp(tierContainer) {
    const prev = tierContainer.previousElementSibling;
    if (prev) tierContainer.parentNode.insertBefore(tierContainer, prev);
  }

  function moveTierDown(tierContainer) {
    const next = tierContainer.nextElementSibling;
    if (next) tierContainer.parentNode.insertBefore(next, tierContainer);
  }

  function deleteTier(tierContainer) {
    if (confirm('Are you sure you want to delete this tier? All tracks in it will be lost.')) {
      tierContainer.remove();
    }
  }

  function showSaveModal() {
    const saveForm = document.getElementById('save-form');
    saveForm.innerHTML = '';
    const tiers = document.querySelectorAll('.tier');
    let hasTiersToSave = false;
    tiers.forEach(tier => {
      const tierLetter = tier.querySelector('.tier-name').value.toUpperCase();
      const tracks = tier.querySelectorAll('.tier-track');
      if (tracks.length > 0) {
        hasTiersToSave = true;
        const group = document.createElement('div');
        group.className = 'save-group';
        group.innerHTML = `
          <label>Tier ${tierLetter} Playlist Name:</label>
          <input type="text" class="playlist-name" data-tier="${tierLetter}" 
                 value="My ${tierLetter} Tier Playlist" required>
          <div class="track-count">${tracks.length} tracks</div>
        `;
        saveForm.appendChild(group);
      }
    });
    if (!hasTiersToSave) {
      showNotification('No tiers with songs to save.', true);
      return;
    }
    document.getElementById('save-modal').style.display = 'block';
  }

  async function saveAllTiers() {
    const inputs = document.querySelectorAll('.playlist-name');
    const saveButton = document.getElementById('save-confirm');
    const originalButtonText = saveButton.textContent;
    for (const input of inputs) {
      if (!input.value.trim()) {
        showNotification(`Please enter a name for Tier ${input.dataset.tier}`, true);
        input.focus();
        return;
      }
    }
    saveButton.disabled = true;
    saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    try {
      const results = [];
      for (const input of inputs) {
        const tierLetter = input.dataset.tier;
        const playlistName = input.value.trim();
        const tier = Array.from(document.querySelectorAll('.tier')).find(
          t => t.querySelector('.tier-name').value.toUpperCase() === tierLetter
        );
        if (tier) {
          const trackUris = Array.from(tier.querySelectorAll('.tier-track')).map(
            track => track.dataset.uri
          );
          if (trackUris.length > 0) {
            try {
              const response = await fetch('/create-playlist', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: accessToken,
                  name: playlistName,
                  tracks: trackUris
                })
              });
              const data = await response.json();
              if (data.url) {
                results.push({
                  tier: tierLetter,
                  success: true,
                  url: data.url
                });
              } else {
                results.push({
                  tier: tierLetter,
                  success: false,
                  error: data.error || 'Unknown error'
                });
              }
            } catch (error) {
              results.push({
                tier: tierLetter,
                success: false,
                error: error.message
              });
            }
          }
        }
      }
      closeSaveModal();
      showSaveResults(results);
    } catch (error) {
      console.error('Save error:', error);
      showNotification('Failed to save playlists. Please try again.', true);
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = originalButtonText;
    }
  }

  function showSaveResults(results) {
    const successResults = results.filter(r => r.success);
    const errorResults = results.filter(r => !r.success);
    let message = '';
    if (successResults.length > 0) {
      message += '<h4>Successfully saved:</h4><ul class="save-success-list">';
      successResults.forEach(result => {
        message += `<li>Tier ${result.tier}: <a href="${result.url}" target="_blank" class="playlist-link">Open in Spotify</a></li>`;
      });
      message += '</ul>';
    }
    if (errorResults.length > 0) {
      message += '<h4>Failed to save:</h4><ul class="save-error-list">';
      errorResults.forEach(result => {
        message += `<li>Tier ${result.tier}: ${result.error || 'Unknown error'}</li>`;
      });
      message += '</ul>';
    }
    const resultsModal = document.createElement('div');
    resultsModal.className = 'modal';
    resultsModal.style.display = 'block';
    resultsModal.innerHTML = `
      <div class="modal-content" style="max-width: 500px;">
        <h3>Save Results</h3>
        <div class="save-results">${message}</div>
        <div class="modal-actions">
          <button id="results-close" class="spotify-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(resultsModal);
    resultsModal.querySelector('#results-close').addEventListener('click', () => {
      resultsModal.remove();
    });
  }

  function closeModal() {
    document.getElementById('tier-modal').style.display = 'none';
  }

  function closeSaveModal() {
    document.getElementById('save-modal').style.display = 'none';
  }

  function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  }

  function showNotification(message, isError = false) {
    const notification = document.createElement('div');
    notification.className = `notification ${isError ? 'error' : ''}`;
    notification.innerHTML = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('show');
      setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
      }, 3000);
    }, 10);
  }

  function initializeDragAndDrop() {
    new Sortable(songResults, {
      group: { name: 'shared', pull: 'clone', put: false },
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag'
    });
    new Sortable(lobby, {
      group: { name: 'shared', pull: 'clone', put: true },
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag'
    });
    document.querySelectorAll('.tier-content').forEach(container => {
      new Sortable(container, {
        group: 'shared',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onAdd: (evt) => {
          const trackId = evt.item.dataset.id;
          const track = allTracks.find(t => t.id === trackId);
          if (track) {
            const newElement = createTierTrackElement(track);
            evt.to.insertBefore(newElement, evt.item);
            evt.item.remove();
          }
        }
      });
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Create default tiers on load
  function createDefaultTiers() {
    const defaultTiers = ['S', 'A', 'B', 'C', 'D', 'F'];
    defaultTiers.forEach(letter => addNewTier(letter));
  }

  // Initialize default tiers
  createDefaultTiers();
});
