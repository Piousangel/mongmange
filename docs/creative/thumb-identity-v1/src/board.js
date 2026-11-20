(() => {
/* global Proto */
const { M, handRecords, shapeFor, renderTile, blitTile, chroma, BG } = Proto;
const INKS = ['songyeon', 'yuyeon', 'jayeon', 'songhwa'];
const IND = [[0, 0], [2, 3], [1, 2], [0, 1], [2, 0], [1, 3]].map(([b, c], i) => ({ t: { body: b, comb: c, ring: 1 }, ink: INKS[i % 4], seed: 101 + i * 7 }));
const A_ASPECT = [1.08, 1.25, 1.5];
const A_COMB = [[1.3, 1.0, 0.65], [0.7, 0.65, 0.6], [0.8, 1.4, 0.75], [0.6, 0.95, 1.35]];
const A_RING = [1.0, 1.3, 1.6];
const LOD = { gap: 0.1, width: 0.17, chroma: 2.2, eye: 1.3, comb: 1.3, blur: 0.004, ringA: 1.3 };

function mk(ind, variant) {
  const custom = variant[0] === 'A' ? { aspect: A_ASPECT[ind.t.body], ratios: A_COMB[ind.t.comb], ring: A_RING[ind.t.body] } : null;
  const shape = shapeFor(ind.t, custom);
  const look = M.inkLook(ind.ink);
  const ownHand = variant.includes('E');
  const recs = ownHand ? handRecords(ind.seed, ind.n ?? 7, shape) : M.day7Records(2, shape);
  const o = { shape, look, recs, pose: ind.pose };
  if (variant.endsWith('B')) o.lodSmall = LOD;
  if (variant[0] === 'C') {
    const c = chroma(look.strokeDay, 2.2, 10);
    o.rim = { color: c, w: 0.035 };
    o.rimSmall = { color: c, w: 0.075 };
  }
  if (variant === 'D') {
    o.mark = { color: '#EFE8DA', x: -0.28, y: -0.12, r: 0.035 };
    o.markSmall = { color: '#EFE8DA', x: -0.28, y: -0.12, r: 0.06 };
  }
  return o;
}
window.Board = { mk, IND, INKS, LOD };

})();
