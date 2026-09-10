import type { RiskLevel, TokenDetail, TokenMarket, TokenSecurity } from './types';
import { band, isNum, logRamp, ramp, ratio, round, weightedMean } from './math';

export type ScoreKey = 'safety' | 'liquidity' | 'momentum' | 'smartMoney' | 'social';

export interface ScoreComponent {
  key: ScoreKey;
  label: string;
  icon: string;
  /** 0-100, or null when no input signal was available. */
  score: number | null;
  weight: number;
  /** Share of this component's own sub-signals that had data, 0-1. */
  coverage: number;
  /** Plain-language findings, most important first. */
  reasons: string[];
  /** One-sentence summary in non-technical language. */
  summary: string;
}

export interface MovaScore {
  /** 0-100, or null when too little data was available to be meaningful. */
  total: number | null;
  components: ScoreComponent[];
  /** 0-1 — how much of the weighted model actually had data behind it. */
  confidence: number;
  risk: RiskLevel;
  /** Present when the total is null, explaining why. */
  unavailableReason?: string;
}

export const SCORE_WEIGHTS: Record<ScoreKey, number> = {
  safety: 0.3,
  liquidity: 0.22,
  momentum: 0.2,
  smartMoney: 0.16,
  social: 0.12,
};

export const SCORE_META: Record<ScoreKey, { label: string; icon: string; blurb: string }> = {
  safety: {
    label: 'Safety',
    icon: '🛡',
    blurb:
      'Contract permissions, liquidity-pool status, and how concentrated the supply is among the largest holders.',
  },
  liquidity: {
    label: 'Liquidity',
    icon: '💧',
    blurb:
      'How much tradable depth backs the token relative to its size, and whether that depth is growing or draining.',
  },
  momentum: {
    label: 'Momentum',
    icon: '🚀',
    blurb:
      'Price direction, how much volume is turning over against the pool, and the balance of buys versus sells.',
  },
  smartMoney: {
    label: 'Smart Money',
    icon: '🐋',
    blurb:
      'Net flow from large and historically profitable wallets. Informational only — wallets are not signals to copy.',
  },
  social: {
    label: 'Social',
    icon: '📱',
    blurb:
      'Attention growth and how organic that attention looks. A high social score can mean hype as easily as substance.',
  },
};

/** Minimum weighted coverage before a total score is considered meaningful. */
export const MIN_CONFIDENCE = 0.35;

// ---------------------------------------------------------------------------
// Component scorers
// ---------------------------------------------------------------------------

function scoreSafety(sec: TokenSecurity, market: TokenMarket): ScoreComponent {
  const reasons: string[] = [];

  const mint = sec.mintAuthorityRevoked == null ? null : sec.mintAuthorityRevoked ? 100 : 0;
  if (sec.mintAuthorityRevoked === true) {
    reasons.push('Mint authority is revoked, so no new supply can be created.');
  } else if (sec.mintAuthorityRevoked === false) {
    reasons.push('Mint authority is still active — supply can be increased at any time.');
  }

  const freeze = sec.freezeAuthorityRevoked == null ? null : sec.freezeAuthorityRevoked ? 100 : 0;
  if (sec.freezeAuthorityRevoked === false) {
    reasons.push('Freeze authority is still active — token accounts could be frozen.');
  }

  let lp: number | null = null;
  if (isNum(sec.lpBurnedPct)) {
    lp = ramp(sec.lpBurnedPct, 20, 95);
    reasons.push(
      sec.lpBurnedPct >= 90
        ? `${round(sec.lpBurnedPct)}% of the liquidity pool is burned.`
        : `Only ${round(sec.lpBurnedPct)}% of the liquidity pool is burned.`,
    );
  } else if (sec.lpLocked != null) {
    lp = sec.lpLocked ? 90 : 10;
    reasons.push(sec.lpLocked ? 'Liquidity is locked.' : 'Liquidity is neither locked nor burned.');
  }

  let top10: number | null = null;
  if (isNum(sec.top10HolderPct)) {
    top10 = ramp(sec.top10HolderPct, 60, 12);
    reasons.push(
      sec.top10HolderPct > 35
        ? `Top 10 wallets hold ${round(sec.top10HolderPct, 1)}% — a small group could move the price.`
        : `Top 10 wallets hold ${round(sec.top10HolderPct, 1)}%, a relatively spread distribution.`,
    );
  }

  let dev: number | null = null;
  if (isNum(sec.devHoldingPct)) {
    dev = ramp(sec.devHoldingPct, 20, 1);
    if (sec.devHoldingPct > 8) {
      reasons.push(`The deployer still holds ${round(sec.devHoldingPct, 1)}% of supply.`);
    }
  }
  if (isNum(sec.devSoldPct) && sec.devSoldPct > 0) {
    reasons.push(`The deployer has already sold ${round(sec.devSoldPct, 1)}% of supply.`);
    const sellPenalty = ramp(sec.devSoldPct, 30, 0);
    dev = dev == null ? sellPenalty : Math.min(dev, sellPenalty);
  }

  const cohortValues = [sec.insiderPct, sec.bundledPct, sec.sniperPct].filter(isNum);
  let cohort: number | null = null;
  if (cohortValues.length > 0) {
    cohort = ramp(Math.max(...cohortValues), 40, 3);
    if (isNum(sec.bundledPct) && sec.bundledPct > 15) {
      reasons.push(`${round(sec.bundledPct, 1)}% of supply was bought in bundled launch transactions.`);
    }
    if (isNum(sec.sniperPct) && sec.sniperPct > 12) {
      reasons.push(`Snipers took ${round(sec.sniperPct, 1)}% of supply in the first blocks.`);
    }
    if (isNum(sec.insiderPct) && sec.insiderPct > 12) {
      reasons.push(`${round(sec.insiderPct, 1)}% sits in wallets linked to the deployer.`);
    }
  }

  const sells = sec.sellsSucceeding == null ? null : sec.sellsSucceeding ? 100 : 0;

  const { value, coverage } = weightedMean([
    { value: mint, weight: 0.2 },
    { value: freeze, weight: 0.13 },
    { value: lp, weight: 0.2 },
    { value: top10, weight: 0.2 },
    { value: dev, weight: 0.11 },
    { value: cohort, weight: 0.11 },
    { value: sells, weight: 0.05 },
  ]);

  let score = value;

  // Hard override: if sells are observed to fail, nothing else matters.
  if (sec.sellsSucceeding === false) {
    score = 0;
    reasons.unshift(
      'Sell transactions are failing. That is the signature of a honeypot — treat the position as unsellable.',
    );
  }

  // A pool that is hours old has not had time to demonstrate much of anything.
  const ageHours = tokenAgeHours(market);
  if (isNum(ageHours) && ageHours < 6 && score != null && sec.sellsSucceeding !== false) {
    score = Math.min(score, 72);
    reasons.push('The pool is only hours old, so there is little history to verify these checks against.');
  }

  if (reasons.length === 0) {
    reasons.push('No contract or holder data was available from the current provider.');
  }

  return {
    key: 'safety',
    label: SCORE_META.safety.label,
    icon: SCORE_META.safety.icon,
    score: score == null ? null : round(score),
    weight: SCORE_WEIGHTS.safety,
    coverage,
    reasons,
    summary: safetySummary(score, sec),
  };
}

function safetySummary(score: number | null, sec: TokenSecurity): string {
  if (sec.sellsSucceeding === false) {
    return 'Sells are not going through. This behaves like a honeypot and carries a severe risk of total loss.';
  }
  if (score == null) return 'Data unavailable — the safety checks could not be run for this token.';
  if (score >= 80) {
    return 'The core contract permissions have been given up and supply is reasonably distributed, which removes the most common rug vectors.';
  }
  if (score >= 60) {
    return 'Most safety checks pass, but at least one item — usually holder concentration or pool status — is worth reading before sizing a position.';
  }
  if (score >= 40) {
    return 'Several safety checks are unresolved. A small group of wallets or the deployer retains meaningful control.';
  }
  return 'Multiple safety checks fail. The structure allows the price to be undermined by the deployer or a handful of holders.';
}

function scoreLiquidity(market: TokenMarket, sec: TokenSecurity): ScoreComponent {
  const reasons: string[] = [];
  const liq = market.liquidityUsd;

  const depthRatio = ratio(liq, market.marketCapUsd);
  let ratioScore: number | null = null;
  if (depthRatio != null) {
    ratioScore = ramp(depthRatio, 0.012, 0.16);
    const pct = round(depthRatio * 100, 1);
    if (depthRatio >= 0.1) {
      reasons.push(`Pool depth equals ${pct}% of market cap — deep relative to the token's size.`);
    } else if (depthRatio >= 0.04) {
      reasons.push(`Pool depth equals ${pct}% of market cap, a workable ratio.`);
    } else {
      reasons.push(`Pool depth is only ${pct}% of market cap, so larger orders will move the price sharply.`);
    }
  }

  let absScore: number | null = null;
  if (isNum(liq)) {
    absScore = logRamp(liq, 5_000, 400_000);
    if (liq < 15_000) {
      reasons.push('Absolute liquidity is small; exiting a position may take several attempts.');
    }
  }

  let trendScore: number | null = null;
  if (isNum(sec.liquidityChange24hPct)) {
    trendScore = ramp(sec.liquidityChange24hPct, -55, 15);
    if (sec.liquidityChange24hPct <= -20) {
      reasons.push(`Liquidity has drained ${round(Math.abs(sec.liquidityChange24hPct), 1)}% in 24h.`);
    } else if (sec.liquidityChange24hPct >= 15) {
      reasons.push(`Liquidity has grown ${round(sec.liquidityChange24hPct, 1)}% in 24h.`);
    }
  }

  const { value, coverage } = weightedMean([
    { value: ratioScore, weight: 0.45 },
    { value: absScore, weight: 0.35 },
    { value: trendScore, weight: 0.2 },
  ]);

  if (reasons.length === 0) reasons.push('No liquidity data was available from the current provider.');

  return {
    key: 'liquidity',
    label: SCORE_META.liquidity.label,
    icon: SCORE_META.liquidity.icon,
    score: value == null ? null : round(value),
    weight: SCORE_WEIGHTS.liquidity,
    coverage,
    reasons,
    summary:
      value == null
        ? 'Data unavailable — pool depth could not be measured for this token.'
        : value >= 75
          ? 'Liquidity is strong relative to market cap, which reduces the probability of extreme slippage on normal position sizes.'
          : value >= 50
            ? 'Liquidity is adequate for modest size, but large orders would still move the price noticeably.'
            : 'Liquidity is thin for this market cap. Slippage on entry and exit is likely to be significant.',
  };
}

function scoreMomentum(market: TokenMarket): ScoreComponent {
  const reasons: string[] = [];

  const c1 = market.change1h;
  const c24 = market.change24h;
  const priceScore = weightedMean([
    { value: isNum(c1) ? ramp(c1, -30, 45) : null, weight: 0.6 },
    { value: isNum(c24) ? ramp(c24, -50, 120) : null, weight: 0.4 },
  ]).value;

  if (isNum(c1)) {
    if (c1 >= 10) reasons.push(`Price is up ${round(c1, 1)}% over the last hour.`);
    else if (c1 <= -10) reasons.push(`Price is down ${round(Math.abs(c1), 1)}% over the last hour.`);
  }

  const turnover = ratio(market.volume1hUsd, market.liquidityUsd);
  let turnoverScore: number | null = null;
  if (turnover != null) {
    // Healthy churn sits around 0.7x the pool per hour. Far above that is
    // usually wash-like or a blow-off top, so the curve falls away again.
    turnoverScore = band(turnover, 0.01, 0.7, 8);
    if (turnover > 4) {
      reasons.push(
        `Hourly volume is ${round(turnover, 1)}x the entire pool — unusually frenetic and often short-lived.`,
      );
    } else if (turnover >= 0.3) {
      reasons.push(`Hourly volume is ${round(turnover, 2)}x pool size — actively traded.`);
    } else {
      reasons.push('Trading volume is quiet relative to pool size.');
    }
  }

  const buys = market.txns1h.buys;
  const sells = market.txns1h.sells;
  let flowScore: number | null = null;
  if (isNum(buys) && isNum(sells) && buys + sells > 0) {
    const share = buys / (buys + sells);
    flowScore = ramp(share, 0.32, 0.68);
    if (share >= 0.6) reasons.push(`${round(share * 100)}% of the last hour's trades were buys.`);
    else if (share <= 0.4) reasons.push(`${round((1 - share) * 100)}% of the last hour's trades were sells.`);
  }

  const { value, coverage } = weightedMean([
    { value: priceScore, weight: 0.4 },
    { value: turnoverScore, weight: 0.35 },
    { value: flowScore, weight: 0.25 },
  ]);

  if (reasons.length === 0) reasons.push('No trading activity data was available from the current provider.');

  return {
    key: 'momentum',
    label: SCORE_META.momentum.label,
    icon: SCORE_META.momentum.icon,
    score: value == null ? null : round(value),
    weight: SCORE_WEIGHTS.momentum,
    coverage,
    reasons,
    summary:
      value == null
        ? 'Data unavailable — recent trading activity could not be measured.'
        : value >= 75
          ? 'Buying pressure and volume are both elevated. Momentum this strong tends to be short-lived, in either direction.'
          : value >= 50
            ? 'Trading is active with a mild directional lean.'
            : 'Activity is subdued or leaning toward sellers.',
  };
}

function scoreSmartMoney(detail: TokenDetail): ScoreComponent {
  const reasons: string[] = [];
  const sm = detail.smartMoney;

  const flowRatio = ratio(sm.netFlow24hUsd, detail.market.liquidityUsd);
  let flowScore: number | null = null;
  if (flowRatio != null) {
    flowScore = ramp(flowRatio, -0.35, 0.35);
    if (isNum(sm.netFlow24hUsd) && sm.netFlow24hUsd !== 0) {
      const amount = Math.round(Math.abs(sm.netFlow24hUsd)).toLocaleString('en-US');
      reasons.push(
        sm.netFlow24hUsd > 0
          ? `Large wallets are net buyers by $${amount} over 24h.`
          : `Large wallets are net sellers by $${amount} over 24h.`,
      );
    }
  }

  let balanceScore: number | null = null;
  if (isNum(sm.whaleBuys24h) && isNum(sm.whaleSells24h) && sm.whaleBuys24h + sm.whaleSells24h > 0) {
    const share = sm.whaleBuys24h / (sm.whaleBuys24h + sm.whaleSells24h);
    balanceScore = ramp(share, 0.3, 0.75);
    reasons.push(`${sm.whaleBuys24h} whale buys against ${sm.whaleSells24h} sells in the last 24h.`);
  }

  let holderScore: number | null = null;
  if (isNum(sm.smartWalletHolders)) {
    holderScore = ramp(sm.smartWalletHolders, 0, 25);
    reasons.push(
      sm.smartWalletHolders > 0
        ? `${sm.smartWalletHolders} wallets with a profitable track record currently hold this token.`
        : 'No wallets from the tracked profitable set currently hold this token.',
    );
  }

  const { value, coverage } = weightedMean([
    { value: flowScore, weight: 0.45 },
    { value: balanceScore, weight: 0.3 },
    { value: holderScore, weight: 0.25 },
  ]);

  if (reasons.length === 0) reasons.push('No wallet-level data was available from the current provider.');

  return {
    key: 'smartMoney',
    label: SCORE_META.smartMoney.label,
    icon: SCORE_META.smartMoney.icon,
    score: value == null ? null : round(value),
    weight: SCORE_WEIGHTS.smartMoney,
    coverage,
    reasons,
    summary:
      value == null
        ? 'Data unavailable — wallet flows could not be read for this token.'
        : value >= 75
          ? 'Tracked large wallets are accumulating. This describes what they have done, not what they will do next.'
          : value >= 50
            ? 'Large-wallet flow is roughly balanced.'
            : 'Tracked large wallets are net distributing into this market.',
  };
}

function scoreSocial(detail: TokenDetail): ScoreComponent {
  const reasons: string[] = [];
  const s = detail.social;

  let growthScore: number | null = null;
  if (isNum(s.mentionsGrowthPct)) {
    growthScore = ramp(s.mentionsGrowthPct, -40, 260);
    if (s.mentionsGrowthPct >= 80) {
      reasons.push(`Mentions are up ${round(s.mentionsGrowthPct)}% over 24h.`);
    } else if (s.mentionsGrowthPct <= -25) {
      reasons.push(`Attention is fading — mentions down ${round(Math.abs(s.mentionsGrowthPct))}%.`);
    }
  }

  let authorScore: number | null = null;
  if (isNum(s.uniqueAuthors24h)) {
    authorScore = logRamp(s.uniqueAuthors24h, 5, 3_000);
    reasons.push(`${s.uniqueAuthors24h.toLocaleString('en-US')} distinct accounts posted about it in 24h.`);
  }

  let botScore: number | null = null;
  if (isNum(s.botLikelihoodPct)) {
    botScore = ramp(s.botLikelihoodPct, 70, 8);
    if (s.botLikelihoodPct >= 45) {
      reasons.push(
        `Roughly ${round(s.botLikelihoodPct)}% of posts show automated patterns, so the raw counts overstate real interest.`,
      );
    }
  }

  let kolScore: number | null = null;
  if (isNum(s.kolMentions24h)) {
    kolScore = ramp(s.kolMentions24h, 0, 12);
    if (s.kolMentions24h > 0) {
      reasons.push(`${s.kolMentions24h} larger accounts mentioned it in the last 24h.`);
    }
  }

  const { value, coverage } = weightedMean([
    { value: growthScore, weight: 0.35 },
    { value: authorScore, weight: 0.25 },
    { value: botScore, weight: 0.25 },
    { value: kolScore, weight: 0.15 },
  ]);

  if (reasons.length === 0) reasons.push('No social data was available from the current provider.');

  return {
    key: 'social',
    label: SCORE_META.social.label,
    icon: SCORE_META.social.icon,
    score: value == null ? null : round(value),
    weight: SCORE_WEIGHTS.social,
    coverage,
    reasons,
    summary:
      value == null
        ? 'Data unavailable — there is no social coverage for this token.'
        : s.authenticity === 'coordinated'
          ? 'Attention is high but the posting patterns look coordinated rather than organic. Treat the enthusiasm as manufactured until it broadens.'
          : value >= 75
            ? 'Attention is growing quickly across a broad set of accounts. A strong social score reflects interest, not fundamentals.'
            : value >= 50
              ? 'There is a steady, moderate level of discussion.'
              : 'Social interest is limited or shrinking.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Momentum from market data alone.
 *
 * List rows carry a {@link TokenSummary}, which has market data but no security
 * or wallet data, so the full model cannot run for them. This exposes the one
 * component that needs nothing else, rather than having the UI re-derive it.
 */
export function momentumFromMarket(market: TokenMarket): number | null {
  return scoreMomentum(market).score;
}

export function tokenAgeHours(market: TokenMarket, now: number = Date.now()): number | null {
  if (!isNum(market.createdAt) || market.createdAt <= 0) return null;
  const hours = (now - market.createdAt) / 3_600_000;
  return hours >= 0 ? hours : null;
}

/**
 * Compute the MOVA score.
 *
 * Components with no underlying data return null and are dropped from the
 * weighted mean rather than counted as zero — a token we know nothing about is
 * not the same as a token we know to be bad. `confidence` reports how much of
 * the model actually had data behind it, and below {@link MIN_CONFIDENCE} the
 * total is withheld entirely rather than published as a misleading number.
 */
export function computeMovaScore(detail: TokenDetail): MovaScore {
  const components: ScoreComponent[] = [
    scoreSafety(detail.security, detail.market),
    scoreLiquidity(detail.market, detail.security),
    scoreMomentum(detail.market),
    scoreSmartMoney(detail),
    scoreSocial(detail),
  ];

  const { value, coverage } = weightedMean(components.map((c) => ({ value: c.score, weight: c.weight })));
  const risk = computeRiskLevel(components, detail);

  if (value == null || coverage < MIN_CONFIDENCE) {
    return {
      total: null,
      components,
      confidence: round(coverage, 2),
      risk,
      unavailableReason:
        coverage <= 0
          ? 'No data was available for this token.'
          : 'Too few signals were available to produce a meaningful score.',
    };
  }

  return { total: round(value), components, confidence: round(coverage, 2), risk };
}

/**
 * Risk is deliberately *not* the inverse of the score: a token can be both
 * high-momentum and high-risk at the same time. It is driven by safety, depth
 * and age only.
 */
export function computeRiskLevel(components: ScoreComponent[], detail: TokenDetail): RiskLevel {
  if (detail.security.sellsSucceeding === false) return 'high';
  if (detail.security.mintAuthorityRevoked === false) return 'high';

  const safety = components.find((c) => c.key === 'safety')?.score ?? null;
  const liquidity = components.find((c) => c.key === 'liquidity')?.score ?? null;
  const ageHours = tokenAgeHours(detail.market);
  const ageScore = ageHours == null ? null : ramp(ageHours, 1, 240);

  const { value, coverage } = weightedMean([
    { value: safety, weight: 0.55 },
    { value: liquidity, weight: 0.33 },
    { value: ageScore, weight: 0.12 },
  ]);

  // Not enough information to clear a token — default to the cautious side.
  if (value == null || coverage < 0.3) return 'elevated';
  if (value >= 78) return 'low';
  if (value >= 60) return 'moderate';
  if (value >= 40) return 'elevated';
  return 'high';
}

/** Sort comparator for scores. Nulls always sort last. */
export function compareByScore(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}
