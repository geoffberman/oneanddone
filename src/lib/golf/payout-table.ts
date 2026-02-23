// PGA Tour payout percentages by finishing position.
// Standard events use 18% for the winner; signature events ($20M purse) use 20%.
// When golfers are tied, they split the total payout for all tied positions equally.
// Sources: PGA Tour distribution chart, 2026 Genesis Invitational payout data.

// Signature event percentages (used for $20M+ purse events)
// Derived from the 2026 Genesis Invitational ($20M purse) payout.
const SIGNATURE_PERCENTAGES: number[] = [
  20.000, 11.000, 7.000, 5.000, 4.200, 3.800, 3.500, 3.230, 3.000, 2.780,
  2.570, 2.360, 2.150, 1.945, 1.845, 1.745, 1.645, 1.545, 1.445, 1.345,
  1.250, 1.165, 1.080, 1.000, 0.920, 0.840, 0.805, 0.770, 0.735, 0.700,
  0.665, 0.630, 0.595, 0.570, 0.545, 0.520, 0.495, 0.470, 0.450, 0.430,
  0.410, 0.390, 0.370, 0.350, 0.330, 0.310, 0.290, 0.280, 0.270, 0.260,
  0.255, 0.250, 0.245, 0.240, 0.235, 0.230, 0.225, 0.220, 0.215, 0.210,
  0.205, 0.200, 0.195, 0.190, 0.185, 0.180, 0.175, 0.170, 0.165,
];

// Standard PGA Tour event percentages (18% winner share).
// Top 10 from PGA Tour official distribution; positions 11-65 scaled from
// signature percentages to match the standard total distribution.
const STANDARD_PERCENTAGES: number[] = [
  18.000, 10.800, 6.800, 4.800, 4.000, 3.600, 3.350, 3.100, 2.900, 2.700,
  2.500, 2.300, 2.100, 1.900, 1.800, 1.700, 1.600, 1.500, 1.400, 1.300,
  1.200, 1.120, 1.040, 0.960, 0.880, 0.800, 0.770, 0.740, 0.710, 0.680,
  0.650, 0.620, 0.590, 0.565, 0.540, 0.515, 0.490, 0.465, 0.445, 0.425,
  0.405, 0.385, 0.365, 0.345, 0.325, 0.305, 0.285, 0.273, 0.261, 0.253,
  0.245, 0.241, 0.237, 0.233, 0.229, 0.225, 0.221, 0.219, 0.217, 0.215,
  0.213, 0.211, 0.209, 0.207, 0.205,
];

const SIGNATURE_PURSE_THRESHOLD = 15_000_000; // $15M+ considered signature event

function getPayoutPercentages(purse: number): number[] {
  return purse >= SIGNATURE_PURSE_THRESHOLD
    ? SIGNATURE_PERCENTAGES
    : STANDARD_PERCENTAGES;
}

/**
 * Compute projected earnings for a player at a given position.
 * Handles ties: if `tiedCount` players share a position, they split the
 * total payout for positions `position` through `position + tiedCount - 1`.
 *
 * @param purse      - Total tournament purse in dollars
 * @param position   - 1-based finishing position (e.g. 1 for 1st place)
 * @param tiedCount  - Number of players sharing this position (default 1)
 * @returns Projected earnings in dollars, or 0 if position is outside the payout range.
 */
export function getProjectedEarnings(
  purse: number,
  position: number,
  tiedCount: number = 1
): number {
  if (position < 1 || purse <= 0) return 0;

  const percentages = getPayoutPercentages(purse);
  const maxPositions = percentages.length;

  // Sum the percentages for all tied positions
  let totalPct = 0;
  for (let i = 0; i < tiedCount; i++) {
    const idx = position - 1 + i; // 0-based index
    if (idx < maxPositions) {
      totalPct += percentages[idx];
    }
  }

  // Each tied player gets an equal share
  const perPlayerPct = totalPct / tiedCount;
  return Math.round((purse * perPlayerPct) / 100);
}
