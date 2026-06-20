window.AdinaShared = (function () {
  'use strict';

  var SPOTIFY_PROFILE_IMAGE = '/assets/adina-spotify-profile.png';
  var SPOTIFY_PROFILE_URL = 'https://open.spotify.com/user/1b669ou3felhdl6afu6i9e0y6?si=17624adbd5a94f93';

  function formatMs(ms) {
    var totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return minutes + ':' + String(seconds).padStart(2, '0');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getTrackUrl(track) {
    if (track && track.uri && track.uri.startsWith('spotify:track:')) {
      return 'https://open.spotify.com/track/' + track.uri.replace('spotify:track:', '');
    }
    if (track && track.id) {
      return 'https://open.spotify.com/track/' + track.id;
    }
    return SPOTIFY_PROFILE_URL;
  }

  function isRealSpotifyTrack(track) {
    return !!(track && track.id && track.uri && track.uri.startsWith('spotify:track:'));
  }

  return {
    SPOTIFY_PROFILE_IMAGE: SPOTIFY_PROFILE_IMAGE,
    SPOTIFY_PROFILE_URL: SPOTIFY_PROFILE_URL,
    formatMs: formatMs,
    escapeHtml: escapeHtml,
    getTrackUrl: getTrackUrl,
    isRealSpotifyTrack: isRealSpotifyTrack
  };
})();
