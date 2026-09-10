import { isNum, round } from './math';

export interface RiskInput {
  /** Total capital the user is working with, in USD. */
  portfolioUsd: number;
  /** Percent of the portfolio to put at risk on this idea, 0-100. */
  riskPct: number;
  entryPrice: number;
  stopPrice: number;
  /** Optional profit objective, used for the reward leg. */
  targetPrice?: number | null;
}

export interface RiskResult {
  ok: boolean;
  /** Populated when `ok` is false; safe to show to the user verbatim. */
  error?: string;
  /** USD the user is choosing to risk. */
  riskAmountUsd: number;
  /** USD value of the position to open. */
  positionSizeUsd: number;
  /** Token units implied by the position size. */
  positionUnits: number;
  /** Distance from entry to stop, as a percent of entry. */
  stopDistancePct: number;
  /** Loss if the stop is hit exactly, in USD (positive number). */
  potentialLossUsd: number;
  /** Gain if the target is hit, in USD. Null when no target given. */
  potentialProfitUsd: number | null;
  /** Reward divided by risk. Null when no target given. */
  riskRewardRatio: number | null;
  /** Position size as a percent of the whole portfolio. */
  portfolioExposurePct: number;
  /** Non-fatal cautions worth surfacing next to the result. */
  warnings: string[];
  direction: 'long' | 'short';
}

const EMPTY: Omit<RiskResult, 'ok' | 'error'> = {
  riskAmountUsd: 0,
  positionSizeUsd: 0,
  positionUnits: 0,
  stopDistancePct: 0,
  potentialLossUsd: 0,
  potentialProfitUsd: null,
  riskRewardRatio: null,
  portfolioExposurePct: 0,
  warnings: [],
  direction: 'long',
};

function fail(error: string): RiskResult {
  return { ok: false, error, ...EMPTY };
}

/**
 * Position sizing from a fixed-fractional risk model: risk a set percentage of
 * the portfolio, and let the distance to the stop determine how large the
 * position may be.
 *
 * This is an educational calculator. It says nothing about whether a trade is
 * likely to work — only how much a predefined loss would cost.
 */
export function calculateRisk(input: RiskInput): RiskResult {
  const { portfolioUsd, riskPct, entryPrice, stopPrice } = input;
  const targetPrice = input.targetPrice ?? null;

  if (!isNum(portfolioUsd) || portfolioUsd <= 0) return fail('Enter a portfolio balance above zero.');
  if (!isNum(riskPct) || riskPct <= 0) return fail('Enter a risk percentage above zero.');
  if (riskPct > 100) return fail('Risk per trade cannot exceed 100% of the portfolio.');
  if (!isNum(entryPrice) || entryPrice <= 0) return fail('Enter an entry price above zero.');
  if (!isNum(stopPrice) || stopPrice <= 0) return fail('Enter a stop price above zero.');
  if (stopPrice === entryPrice) return fail('The stop price must differ from the entry price.');

  const direction: 'long' | 'short' = stopPrice < entryPrice ? 'long' : 'short';
  const riskPerUnit = Math.abs(entryPrice - stopPrice);
  const stopDistancePct = (riskPerUnit / entryPrice) * 100;

  const riskAmountUsd = portfolioUsd * (riskPct / 100);
  const positionUnits = riskAmountUsd / riskPerUnit;
  let positionSizeUsd = positionUnits * entryPrice;

  const warnings: string[] = [];

  // Fixed-fractional sizing with a very tight stop implies leverage. MOVA does
  // not assume any, so the position is capped at the portfolio and the user is
  // told the risk budget can no longer be met.
  let cappedUnits = positionUnits;
  if (positionSizeUsd > portfolioUsd) {
    cappedUnits = portfolioUsd / entryPrice;
    positionSizeUsd = portfolioUsd;
    warnings.push(
      'The stop is close enough to entry that hitting your risk budget would need more than your whole portfolio. The position has been capped at 100% of the balance, so the real risk is now below your target.',
    );
  }

  const potentialLossUsd = cappedUnits * riskPerUnit;

  let potentialProfitUsd: number | null = null;
  let riskRewardRatio: number | null = null;
  if (isNum(targetPrice) && targetPrice > 0) {
    const rewardPerUnit =
      direction === 'long' ? targetPrice - entryPrice : entryPrice - targetPrice;
    potentialProfitUsd = cappedUnits * rewardPerUnit;
    riskRewardRatio = rewardPerUnit / riskPerUnit;
    if (rewardPerUnit <= 0) {
      warnings.push(
        direction === 'long'
          ? 'The target sits below the entry, so this plan books a loss even when it works.'
          : 'The target sits above the entry, so this plan books a loss even when it works.',
      );
    } else if (riskRewardRatio < 1) {
      warnings.push(
        `Reward is ${round(riskRewardRatio, 2)}x risk. Below 1:1 the idea has to be right more often than not just to break even.`,
      );
    }
  }

  if (riskPct > 5) {
    warnings.push(
      `Risking ${round(riskPct, 2)}% on a single memecoin is aggressive. A run of ordinary losses compounds quickly at this size.`,
    );
  }
  if (stopDistancePct > 60) {
    warnings.push(
      `The stop is ${round(stopDistancePct, 1)}% away from entry, which is wide enough that the position may be doing little to limit the loss.`,
    );
  }

  return {
    ok: true,
    riskAmountUsd: round(riskAmountUsd, 2),
    positionSizeUsd: round(positionSizeUsd, 2),
    positionUnits: cappedUnits,
    stopDistancePct: round(stopDistancePct, 2),
    potentialLossUsd: round(potentialLossUsd, 2),
    potentialProfitUsd: potentialProfitUsd == null ? null : round(potentialProfitUsd, 2),
    riskRewardRatio: riskRewardRatio == null ? null : round(riskRewardRatio, 2),
    portfolioExposurePct: round((positionSizeUsd / portfolioUsd) * 100, 2),
    warnings,
    direction,
  };
}
