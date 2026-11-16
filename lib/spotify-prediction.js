const hourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23',
});
const hourOf = date => Number(hourFormatter.format(date));

// Dirichlet-style posterior predictive: top-track affinity supplies prior mass;
// recency- and hour-weighted observed plays supply fractional evidence.
function predict(topTracks = [], plays = [], now = new Date()) {
  const tracks = new Map();
  const valid = track => track?.id && track.type !== 'episode' && !track.is_local;
  topTracks.filter(valid).forEach((track, rank) => {
    tracks.set(track.id, { track, prior: 1 / (rank + 1), evidence: 0 });
  });
  const seen = new Set();
  let observations = 0;
  for (const play of plays) {
    if (!valid(play.track)) continue;
    const date = new Date(play.played_at);
    const age = (now - date) / 86400000;
    const key = `${play.track.id}:${play.played_at}`;
    if (!Number.isFinite(age) || age < 0 || seen.has(key)) continue;
    seen.add(key);
    observations++;
    if (!tracks.has(play.track.id)) {
      tracks.set(play.track.id, { track: play.track, prior: 0.02, evidence: 0 });
    }
    const distance = Math.abs(hourOf(now) - hourOf(date));
    const circularDistance = Math.min(distance, 24 - distance);
    const hourWeight = Math.exp(-0.5 * (circularDistance / 2) ** 2);
    tracks.get(play.track.id).evidence += Math.pow(0.5, age / 7) * hourWeight;
  }
  if (!tracks.size) return null;
  const priorSum = [...tracks.values()].reduce((sum, entry) => sum + entry.prior, 0);
  const ranked = [...tracks.values()].map(entry => ({
    ...entry, score: 8 * entry.prior / priorSum + entry.evidence,
  })).sort((a, b) => b.score - a.score || a.track.id.localeCompare(b.track.id));
  const track = ranked[0].track;
  return {
    track: {
      id: track.id, name: track.name,
      artist: (track.artists || []).map(artist => artist.name).join(', '),
      album_art_url: track.album?.images?.[0]?.url || null,
    },
    basis: observations ? 'recent listening and the time of day' : 'recent favorites',
    observations,
    timezone: 'America/Los_Angeles',
  };
}
module.exports = { predict, hourOf };
