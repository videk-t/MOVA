import type { TokenDetail } from '@/core/types';
import type { MovaScore } from '@/core/scoring';
import { tokenAgeHours } from '@/core/scoring';
import { isNum, ratio, round } from '@/core/math';
import { formatAge, formatUsdCompact } from '@/core/format';
import type { AiAnalysis, AiSection } from './types';

/**
 * Grounded analysis layer.
 *
 * Every sentence this produces is derived from a value that is actually present
 * in the payload. There is no model here inventing plausible-sounding metrics,
 * and nothing that reads as advice: the output describes what the data shows and
 * what it does not show, and leaves the decision with the reader.
 *
 * A hosted LLM implementation lives behind the same {@link AiAnalysis} contract
 * in the backend (`server/src/analysis.ts`); it is given only these same fields
 * and is instructed to refuse to speculate beyond them.
 */

interface Finding {
  tone: AiSection['tone'];
  title: string;
  body: string;
  /** Higher wins when trimming to the most important findings. */
  priority: number;
}

export function buildAnalysis(detail: TokenDetail, score: MovaScore): AiAnalysis {
  const findings: Finding[] = [];
  const gaps: string[] = [];
  const { market, security, smartMoney, social } = detail;

  // --- Structural risk -----------------------------------------------------

  if (security.sellsSucceeding === false) {
    findings.push({
      tone: 'warning',
      title: 'Sells are failing',
      priority: 100,
      body: 'Sell transactions against this pool are not completing. That pattern is characteristic of a honeypot, and a position taken here should be assumed unrecoverable rather than merely risky.',
    });
  }

  if (security.mintAuthorityRevoked === false) {
    findings.push({
      tone: 'warning',
      title: 'Supply can still be minted',
      priority: 92,
      body: 'Mint authority has not been revoked, so the deployer retains the ability to create new tokens and dilute existing holders at any time.',
    });
  } else if (security.mintAuthorityRevoked === true && security.freezeAuthorityRevoked === true) {
    findings.push({
      tone: 'positive',
      title: 'Contract permissions given up',
      priority: 62,
      body: 'Both mint and freeze authority are revoked, which removes the two most direct ways a deployer can act against holders after launch.',
    });
  }

  if (isNum(security.top10HolderPct)) {
    if (security.top10HolderPct >= 45) {
      findings.push({
        tone: 'warning',
        title: 'Supply is concentrated',
        priority: 84,
        body: `The ten largest wallets control ${round(security.top10HolderPct, 1)}% of supply. A single decision by one of them could move the price further than ordinary trading would.`,
      });
    } else if (security.top10HolderPct <= 20) {
      findings.push({
        tone: 'positive',
        title: 'Holders are spread out',
        priority: 55,
        body: `The top ten wallets hold ${round(security.top10HolderPct, 1)}%, which is a comparatively flat distribution for a token of this size.`,
      });
    }
  } else {
    gaps.push('Holder distribution');
  }

  if (isNum(security.devSoldPct) && security.devSoldPct > 0) {
    findings.push({
      tone: 'warning',
      title: 'Deployer has sold',
      priority: 80,
      body: `The deploying wallet has already sold ${round(security.devSoldPct, 1)}% of supply. That is realised capital leaving the project, whatever the stated reason.`,
    });
  }

  // --- Liquidity -----------------------------------------------------------

  const depth = ratio(market.liquidityUsd, market.marketCapUsd);
  if (depth != null) {
    if (depth >= 0.08) {
      findings.push({
        tone: 'positive',
        title: 'Liquidity is proportionate',
        priority: 58,
        body: `Pool depth of ${formatUsdCompact(market.liquidityUsd)} against a ${formatUsdCompact(market.marketCapUsd)} cap is ${round(depth * 100, 1)}% — deep enough that normal position sizes should not move the price much.`,
      });
    } else if (depth < 0.03) {
      findings.push({
        tone: 'warning',
        title: 'Thin book for the size',
        priority: 78,
        body: `Only ${round(depth * 100, 1)}% of the market cap is backed by pool liquidity. Slippage will be material in both directions, and exiting will be harder than entering.`,
      });
    }
  } else {
    gaps.push('Pool depth relative to market cap');
  }

  if (isNum(security.liquidityChange24hPct) && security.liquidityChange24hPct <= -20) {
    findings.push({
      tone: 'warning',
      title: 'Liquidity is draining',
      priority: 88,
      body: `Pool depth is down ${round(Math.abs(security.liquidityChange24hPct), 1)}% over 24 hours. Liquidity leaving ahead of price is a structural change, not a price fluctuation.`,
    });
  } else if (isNum(security.liquidityChange24hPct) && security.liquidityChange24hPct >= 20) {
    findings.push({
      tone: 'positive',
      title: 'Liquidity is being added',
      priority: 52,
      body: `Pool depth has grown ${round(security.liquidityChange24hPct, 1)}% in 24 hours, which reduces slippage compared with yesterday.`,
    });
  }

  // --- Momentum ------------------------------------------------------------

  const turnover = ratio(market.volume1hUsd, market.liquidityUsd);
  if (isNum(market.change1h)) {
    if (market.change1h >= 12 && turnover != null && turnover >= 0.8) {
      findings.push({
        tone: 'neutral',
        title: 'Move is backed by volume',
        priority: 70,
        body: `Price is up ${round(market.change1h, 1)}% in the last hour on turnover of ${round(turnover, 1)}x the pool. Volume confirming a move says the move is real; it does not say how long it lasts.`,
      });
    } else if (market.change1h >= 12) {
      findings.push({
        tone: 'warning',
        title: 'Move is running ahead of volume',
        priority: 74,
        body: `Price is up ${round(market.change1h, 1)}% in the last hour, but turnover is light relative to the pool. Moves on thin volume reverse more easily than they look like they will.`,
      });
    } else if (market.change1h <= -12) {
      findings.push({
        tone: 'warning',
        title: 'Selling into the hour',
        priority: 72,
        body: `Price is down ${round(Math.abs(market.change1h), 1)}% over the last hour.`,
      });
    }
  } else {
    gaps.push('Recent price change');
  }

  if (turnover != null && turnover > 4) {
    findings.push({
      tone: 'warning',
      title: 'Turnover is extreme',
      priority: 66,
      body: `Hourly volume is ${round(turnover, 1)} times the entire pool. Activity at that ratio is usually a short-lived crowd or wash-like trading rather than sustained accumulation.`,
    });
  }

  const hourTxns = (market.txns1h.buys ?? 0) + (market.txns1h.sells ?? 0);
  if (isNum(market.txns1h.buys) && hourTxns > 20) {
    const buyShare = (market.txns1h.buys / hourTxns) * 100;
    if (buyShare >= 62 || buyShare <= 38) {
      findings.push({
        tone: 'neutral',
        title: buyShare >= 62 ? 'Order flow leans to buyers' : 'Order flow leans to sellers',
        priority: 44,
        body: `${round(buyShare)}% of the last hour's ${hourTxns} transactions were buys.`,
      });
    }
  }

  // --- Smart money ---------------------------------------------------------

  if (isNum(smartMoney.netFlow24hUsd)) {
    const flowRatio = ratio(smartMoney.netFlow24hUsd, market.liquidityUsd);
    if (flowRatio != null && Math.abs(flowRatio) > 0.08) {
      const accumulating = smartMoney.netFlow24hUsd > 0;
      findings.push({
        tone: accumulating ? 'positive' : 'warning',
        title: accumulating ? 'Large wallets are accumulating' : 'Large wallets are distributing',
        priority: 64,
        body: `Tracked large wallets are net ${accumulating ? 'buyers' : 'sellers'} of ${formatUsdCompact(Math.abs(smartMoney.netFlow24hUsd))} over 24 hours, roughly ${round(Math.abs(flowRatio) * 100)}% of pool depth. This is a record of what those wallets did, not a signal to follow them.`,
      });
    }
  } else {
    gaps.push('Wallet-level flows');
  }

  const devSells = smartMoney.events.filter((e) => e.tag === 'dev' && e.action === 'sell');
  if (devSells.length > 0) {
    const total = devSells.reduce((sum, e) => sum + e.amountUsd, 0);
    findings.push({
      tone: 'warning',
      title: 'Deployer wallet activity',
      priority: 86,
      body: `The deploying wallet appears in ${devSells.length} recent sell transaction${devSells.length === 1 ? '' : 's'} totalling about ${formatUsdCompact(total)}.`,
    });
  }

  // --- Social --------------------------------------------------------------

  if (social.authenticity === 'coordinated') {
    findings.push({
      tone: 'warning',
      title: 'Social activity looks coordinated',
      priority: 76,
      body: isNum(social.botLikelihoodPct)
        ? `Around ${round(social.botLikelihoodPct)}% of posts show automated patterns. Treat the mention count as manufactured attention until it broadens to more distinct accounts.`
        : 'Posting patterns look repetitive rather than organic. Treat the mention count as manufactured attention.',
    });
  } else if (isNum(social.mentionsGrowthPct) && social.mentionsGrowthPct >= 100) {
    findings.push({
      tone: 'neutral',
      title: 'Attention is climbing quickly',
      priority: 60,
      body: `Mentions are up ${round(social.mentionsGrowthPct)}% over 24 hours across ${
        isNum(social.uniqueAuthors24h) ? social.uniqueAuthors24h.toLocaleString('en-US') : 'an unreported number of'
      } accounts. Rising attention often precedes volatility in both directions, and part of any recent move may be speculative.`,
    });
  }

  if (social.mentions24h == null) gaps.push('Social mentions');

  // --- Age -----------------------------------------------------------------

  const ageHours = tokenAgeHours(market);
  if (ageHours != null && ageHours < 24) {
    findings.push({
      tone: 'warning',
      title: 'Very new pool',
      priority: 68,
      body: `This pool is ${formatAge(ageHours)} old. There is not yet enough history to distinguish a durable market from an opening burst of activity.`,
    });
  }

  if (market.holders == null) gaps.push('Holder count');
  if (market.volume24hUsd == null) gaps.push('24h volume');

  // --- Assemble ------------------------------------------------------------

  const sections = findings
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6)
    .map(({ tone, title, body }) => ({ tone, title, body }));

  if (sections.length === 0) {
    sections.push({
      tone: 'neutral',
      title: 'Nothing stands out',
      body: 'None of the tracked signals is far enough from its normal range to be worth calling out. That is not the same as a clean bill of health — it means the available data is unremarkable.',
    });
  }

  return {
    headline: headlineFor(detail, score, findings),
    sections,
    dataGaps: [...new Set(gaps)],
    generatedAt: Date.now(),
  };
}

function headlineFor(detail: TokenDetail, score: MovaScore, findings: Finding[]): string {
  const symbol = detail.ref.symbol;

  if (detail.security.sellsSucceeding === false) {
    return `${symbol} shows honeypot behaviour — sells are not completing.`;
  }
  if (score.total == null) {
    return `Not enough data on ${symbol} to score it. What follows is limited to the fields that were available.`;
  }

  const warnings = findings.filter((f) => f.tone === 'warning').length;
  const positives = findings.filter((f) => f.tone === 'positive').length;

  if (score.risk === 'high') {
    return `${symbol} scores ${score.total}, but the structure carries high risk regardless of that number.`;
  }
  if (warnings === 0 && positives > 0) {
    return `${symbol} scores ${score.total} with no tracked signal currently flagging against it.`;
  }
  if (warnings >= 3) {
    return `${symbol} scores ${score.total}, with ${warnings} signals pointing the other way.`;
  }
  return `${symbol} scores ${score.total}. ${warnings === 1 ? 'One signal is' : `${warnings} signals are`} worth reading before acting on the rest.`;
}
