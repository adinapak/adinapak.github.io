const test = require('node:test');
const assert = require('node:assert/strict');
const { predict, hourOf } = require('../lib/spotify-prediction');
const track = id => ({ id, name: id, artists: [{name: 'Artist'}] });
const now = new Date('2026-11-16T03:00:00Z'); // 7 p.m. Pacific

test('empty data gives no fabricated guess', () => assert.equal(predict([], [], now), null));
test('cold start uses favorites', () => {
  const result = predict([track('favorite'), track('other')], [], now);
  assert.equal(result.track.id, 'favorite');
  assert.equal(result.basis, 'recent favorites');
});
test('repeated same-hour evidence can outweigh the favorite', () => {
  const plays = Array.from({length: 7}, (_, day) => ({track: track('evening'), played_at: new Date(+now - day * 86400000).toISOString()}));
  assert.equal(predict([track('favorite'), track('evening')], plays, now).track.id, 'evening');
});
test('duplicate history entries count once', () => {
  const play = {track: track('x'), played_at: now.toISOString()};
  assert.deepEqual(predict([], [play, play], now), predict([], [play], now));
});
test('invalid and future plays are ignored', () => {
  assert.equal(predict([], [{track: track('x'), played_at: 'bad'}, {track: track('y'), played_at: '2099-01-01'}], now), null);
});
test('Pacific hour respects seasonal offset', () => {
  assert.equal(hourOf(now), 19);
  assert.equal(hourOf(new Date('2026-07-16T03:00:00Z')), 20);
});
