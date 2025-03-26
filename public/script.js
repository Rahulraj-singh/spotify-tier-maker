// DOM Elements
const app = document.getElementById('app');
const builderContainer = document.querySelector('.builder-container');
const songResults = document.getElementById('song-results');
const albumResults = document.getElementById('album-results');
const lobby = document.getElementById('lobby');
const tierList = document.getElementById('tier-list');
const searchInput = document.getElementById('search-input');
const loginContainer = document.getElementById('login-container');
const mainLoginBtn = document.getElementById('main-login-btn');
const saveTierlistBtn = document.getElementById('save-tierlist');
const selectAllLobbyBtn = document.getElementById('select-all-lobby');
const clearLobbyBtn = document.getElementById('clear-lobby');
const addTierBtn = document.getElementById('add-tier');

// Modal Elements
const tierModal = document.getElementById('tier-modal');
const tierSelect = document.getElementById('tier-select');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const saveModal = document.getElementById('save-modal');
const saveForm = document.getElementById('save-form');
const saveCancel = document.getElementById('save-cancel');
const saveConfirm = document.getElementById('save-confirm');

// Templates
const tierTemplate = document.getElementById('tier-template');
const trackTemplate = document.getElementById('track-template');
const albumTemplate = document.getElementById('album-template');

// State
let accessToken = new URLSearchParams(window.location.search).get('access_token');
let allTracks = [];
let currentTrackSource = 'global';
let modalCallback = null;
let selectedTrackForModal = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  if (accessToken) {
    initializeApp();
  } else {
    checkUrlForToken();
  }
});

function checkUrlForToken() {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const token = hashParams.get('access_token');
  if (token) {
    accessToken = token;
    window.history.replaceState({}, document.title, window.location.pathname);
    initializeApp();
  }
}

function login() {
  window.location.href = '/login';
}

function initializeApp() {
  loginContainer.style.display = 'none';
  if (mainLoginBtn) mainLoginBtn.style.display = 'none';
  const initialState = document.querySelector('.initial-state');
  if (initialState) initialState.style.display = 'none';
  builderContainer.style.display = 'grid';
  
  createDefaultTiers();
  setupEventListeners();
  initializeDragAndDrop();
}

function setupEventListeners() {
  // Search functionality
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  
  // Lobby buttons
  selectAllLobbyBtn.addEventListener('click', selectAllInLobby);
  clearLobbyBtn.addEventListener('click', clearLobby);
  
  // Tier management
  addTierBtn.addEventListener('click', addNewTier);
  
  // Save functionality
  saveTierlistBtn.addEventListener('click', showSaveModal);
  saveCancel.addEventListener('click', closeSaveModal);
  saveConfirm.addEventListener('click', saveAllTiers);
  
  // Tier selection modal
  modalCancel.addEventListener('click', closeModal);
  modalConfirm.addEventListener('click', confirmTierSelection);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

async function handleSearch() {
  const searchTerm = searchInput.value.trim();
  if (searchTerm.length === 0) {
    songResults.innerHTML = '';
    albumResults.innerHTML = '';
    return;
  }
  
  try {
    const response = await fetch(`/search?q=${encodeURIComponent(searchTerm)}&access_token=${accessToken}`);
    const result = await response.json();
    allTracks = result.tracks;
    renderSongResults(result.tracks);
    renderAlbumResults(result.albums);
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
    const trackElement = trackTemplate.content.cloneNode(true);
    const container = trackElement.querySelector('.track');
    
    // Safe property access with fallbacks
    container.dataset.id = track.id || '';
    container.dataset.uri = track.uri || '';
    
    const artEl = trackElement.querySelector('.track-art');
    artEl.src = track.album?.images?.[0]?.url || 'https://via.placeholder.com/80?text=No+Image';
    artEl.alt = track.album?.name || 'Unknown Album';
  
    trackElement.querySelector('.track-title').textContent = track.name || 'Unknown Track';
    trackElement.querySelector('.track-artist').textContent = 
      track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
    
    // Duration fallback
    const duration = track.duration_ms 
      ? formatDuration(track.duration_ms)
      : '0:00';
    trackElement.querySelector('.track-duration').textContent = duration;
  
    // Event listeners
    trackElement.querySelector('.track-select').addEventListener('click', () => addToLobby(container));
    trackElement.querySelector('.add').addEventListener('click', () => showTierModal(track, container));
  
    return trackElement;
  }

function createAlbumElement(album) {
    const albumElement = albumTemplate.content.cloneNode(true);
    const albumContainer = albumElement.querySelector('.album');
    albumContainer.dataset.id = album.id;
    
    // Set album info
    const albumArt = albumElement.querySelector('.album-art');
    albumArt.src = album.images[0]?.url || 'https://via.placeholder.com/80';
    albumArt.alt = album.name;
    albumElement.querySelector('.album-title').textContent = album.name;
    
    // Show artist and track count
    const artistText = album.artists.map(a => a.name).join(', ');
    const trackCount = album.total_tracks || '?';
    albumElement.querySelector('.album-artist').textContent = `${artistText} • ${trackCount} tracks`;
    
    // Set up event listener
    albumElement.querySelector('.add-album').addEventListener('click', () => addAlbumToLobby(album));
    
    return albumElement;
  }

function addToLobby(trackElement) {
  if (trackElement.parentElement === songResults) {
    songResults.removeChild(trackElement);
  }
  
  // Check if track already exists in lobby
  const existingTrack = lobby.querySelector(`[data-id="${trackElement.dataset.id}"]`);
  if (!existingTrack) {
    lobby.appendChild(trackElement);
  }
}

async function addAlbumToLobby(album) {
    const albumElement = albumResults.querySelector(`[data-id="${album.id}"]`);
    const addButton = albumElement?.querySelector('.add-album');
    let albumImages = [];
    let albumName = 'Unknown Album';
  
    try {
      // Show loading state
      if (addButton) {
        addButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';
        addButton.disabled = true;
      }
  
      // 1. Get album details with fallback
      try {
        const detailsResponse = await fetch(`/album-details?album_id=${album.id}&access_token=${accessToken}`);
        if (detailsResponse.ok) {
          const details = await detailsResponse.json();
          albumImages = details.images || [];
          albumName = details.name || albumName;
        }
      } catch (detailsError) {
        console.warn('Album details warning:', detailsError);
      }
  
      // 2. Get all tracks
      const tracksResponse = await fetch(`/album-tracks?album_id=${album.id}&access_token=${accessToken}`);
      if (!tracksResponse.ok) throw new Error('Failed to get album tracks');
      const tracks = await tracksResponse.json();
      
      // 3. Process tracks with fallback images
      const processedTracks = tracks.map(track => ({
        ...track,
        album: {
          name: albumName,
          images: albumImages,
          // Preserve existing album data if available
          ...track.album
        }
      }));
  
      // 4. Add tracks with duplicate check
      const existingIds = new Set([
        ...Array.from(lobby.children).map(t => t.dataset.id),
        ...Array.from(document.querySelectorAll('.tier-track')).map(t => t.dataset.id)
      ]);
  
      let addedCount = 0;
      const fragment = document.createDocumentFragment();
  
      processedTracks.forEach(track => {
        if (!existingIds.has(track.id)) {
          const element = createTrackElement(track);
          fragment.appendChild(element);
          existingIds.add(track.id);
          addedCount++;
        }
      });
  
      lobby.appendChild(fragment);
  
      // 5. Handle results
      const message = addedCount > 0 
        ? `Added ${addedCount} track${addedCount !== 1 ? 's' : ''} from "${albumName}"`
        : `All tracks from "${albumName}" already exist`;
      
      showNotification(message);
  
      // Remove album from search if any tracks were added
      if (addedCount > 0 && albumElement) {
        albumElement.remove();
      }
  
    } catch (error) {
      console.error('Album add error:', error);
      showNotification(error.message || 'Failed to add album tracks', true);
    } finally {
      // Reset button state
      if (addButton) {
        addButton.innerHTML = '<i class="fas fa-plus"></i> Add Album';
        addButton.disabled = false;
      }
    }
  }
  async function fetchAlbumDetails(albumId) {
    const response = await fetch(`/album-details?album_id=${albumId}&access_token=${accessToken}`);
    if (!response.ok) throw new Error('Failed to get album details');
    return response.json();
  }
  
  async function fetchAlbumTracks(albumId) {
    const response = await fetch(`/album-tracks?album_id=${albumId}&access_token=${accessToken}`);
    if (!response.ok) throw new Error('Failed to get album tracks');
    return response.json();
  }  

function selectAllInLobby() {
  const tracks = songResults.querySelectorAll('.track');
  tracks.forEach(track => addToLobby(track));
}

function clearLobby() {
  while (lobby.firstChild) {
    songResults.appendChild(lobby.firstChild);
  }
}

function createDefaultTiers() {
  const defaultTiers = ['S', 'A', 'B', 'C', 'D', 'F'];
  defaultTiers.forEach(letter => addNewTier(letter));
}

function addNewTier(letter = null) {
  const tierElement = tierTemplate.content.cloneNode(true);
  const tierContainer = tierElement.querySelector('.tier');
  
  // Set tier letter
  const tierNameInput = tierElement.querySelector('.tier-name');
  if (letter) {
    tierNameInput.value = letter;
  }
  
  // Set up tier actions
  const upBtn = tierContainer.querySelector('.up');
  const downBtn = tierContainer.querySelector('.down');
  const deleteBtn = tierContainer.querySelector('.delete');
  
  upBtn.addEventListener('click', () => moveTierUp(tierContainer));
  downBtn.addEventListener('click', () => moveTierDown(tierContainer));
  deleteBtn.addEventListener('click', () => deleteTier(tierContainer));
  
  // Set up drag and drop for tier content
  const tierContent = tierContainer.querySelector('.tier-content');
  new Sortable(tierContent, {
    group: 'shared',
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    dragClass: 'sortable-drag'
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

function showTierModal(track, trackElement) {
  selectedTrackForModal = { track, trackElement };
  
  // Populate tier select dropdown
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
  
  // Set up modal callback
  modalCallback = (selectedTier) => {
    const tier = tiers.find(t => t.letter === selectedTier);
    if (tier) {
      addTrackToTier(track, tier.element);
    }
  };
  
  tierModal.style.display = 'block';
}

function confirmTierSelection() {
  const selectedTier = tierSelect.value;
  if (modalCallback) {
    modalCallback(selectedTier);
  }
  closeModal();
}

function addTrackToTier(track, tierElement) {
    const tierTrack = createTierTrackElement(track);
    if (!tierTrack) return; // Skip if duplicate
    
    const tierContent = tierElement.querySelector('.tier-content');
    tierContent.appendChild(tierTrack);
    
    // Remove from lobby if it's there
    const lobbyTrack = lobby.querySelector(`[data-id="${track.id}"]`);
    if (lobbyTrack) lobbyTrack.remove();
  }

  function createTierTrackElement(track, checkDuplicate = true) {
    if (checkDuplicate) {
      // Check if track already exists in any tier
      const existingTracks = document.querySelectorAll('.tier-track');
      for (let i = 0; i < existingTracks.length; i++) {
        if (existingTracks[i].dataset.id === track.id) {
          showNotification('This track is already in a tier', true);
          return null;
        }
      }
    }
  
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

function closeModal() {
  tierModal.style.display = 'none';
  modalCallback = null;
  selectedTrackForModal = null;
}

function showSaveModal() {
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
  
  saveModal.style.display = 'block';
}

function closeSaveModal() {
  saveModal.style.display = 'none';
}

async function saveAllTiers() {
  const inputs = saveForm.querySelectorAll('.playlist-name');
  const saveButton = saveConfirm;
  const originalButtonText = saveButton.textContent;
  
  // Validate inputs first
  for (const input of inputs) {
    if (!input.value.trim()) {
      showNotification(`Please enter a name for Tier ${input.dataset.tier}`, true);
      input.focus();
      return;
    }
  }
  
  // Disable button during save
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
            if (data.success) {
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
  
  // Create a modal to show results
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

// Update the initializeDragAndDrop function
function initializeDragAndDrop() {
    // Search results - only allow cloning
    new Sortable(songResults, {
      group: { 
        name: 'shared', 
        pull: 'clone',
        put: false
      },
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      setData: function (dataTransfer, dragEl) {
        dataTransfer.setData('Text', dragEl.textContent);
      }
    });
  
    // Lobby - allow moving within lobby and cloning to tiers
    new Sortable(lobby, {
      group: { 
        name: 'shared',
        pull: 'clone',
        put: true
      },
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag'
    });
  
    // Tier contents - handle drops and transform elements
    document.querySelectorAll('.tier-content').forEach(container => {
      new Sortable(container, {
        group: 'shared',
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onAdd: (evt) => {
          // Get the original track data
          const trackId = evt.item.dataset.id;
          const track = allTracks.find(t => t.id === trackId);
          
          if (track) {
            // Replace dragged element with proper tier track format
            const newElement = createTierTrackElement(track);
            evt.to.insertBefore(newElement, evt.item);
            evt.item.remove();
          }
        }
      });
    });
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