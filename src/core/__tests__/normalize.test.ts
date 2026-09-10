import {
  normalizeCandles,
  normalizeMarket,
  normalizeTokenDetail,
  normalizeTokenRef,
  toChangePct,
  toDisplayText,
  toNumber,
  toPct,
  toSafeUrl,
  toSolanaAddress,
  toTimestamp,
  toUsd,
} from '../normalize';

const VALID_ADDRESS = '7xKXtg2CW3xM8mQvKzYbNpRdFhJnLsWuVaBcDeFgHi9';

describe('toNumber', () => {
  it('accepts numbers and numeric strings', () => {
    expect(toNumber(42)).toBe(42);
    expect(toNumber('42.5')).toBe(42.5);
    expect(toNumber('-3')).toBe(-3);
    expect(toNumber('1e3')).toBe(1000);
    expect(toNumber('.5')).toBe(0.5);
  });

  it('rejects values Number() would coerce surprisingly', () => {
    expect(toNumber('')).toBeNull();
    expect(toNumber('   ')).toBeNull();
    expect(toNumber('0x10')).toBeNull();
    expect(toNumber('Infinity')).toBeNull();
    expect(toNumber('12abc')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNumber([])).toBeNull();
    expect(toNumber({})).toBeNull();
    expect(toNumber(true)).toBeNull();
  });
});

describe('toUsd', () => {
  it('rejects negative and absurd magnitudes', () => {
    expect(toUsd(1_240_000)).toBe(1_240_000);
    expect(toUsd(-1)).toBeNull();
    expect(toUsd(1e20)).toBeNull();
  });
});

describe('toPct', () => {
  it('only accepts values inside 0-100', () => {
    expect(toPct(23.4)).toBe(23.4);
    expect(toPct(0)).toBe(0);
    expect(toPct(100)).toBe(100);
    expect(toPct(101)).toBeNull();
    expect(toPct(-0.1)).toBeNull();
  });
});

describe('toChangePct', () => {
  it('floors at a total loss and rejects nonsense', () => {
    expect(toChangePct(47.2)).toBe(47.2);
    expect(toChangePct(-250)).toBe(-100);
    expect(toChangePct(1e9)).toBeNull();
  });
});

describe('toTimestamp', () => {
  it('upgrades seconds to milliseconds', () => {
    const seconds = 1_700_000_000;
    expect(toTimestamp(seconds)).toBe(seconds * 1000);
    expect(toTimestamp(seconds * 1000)).toBe(seconds * 1000);
  });

  it('rejects impossible dates', () => {
    expect(toTimestamp(0)).toBeNull();
    expect(toTimestamp(-1)).toBeNull();
    expect(toTimestamp(Date.now() + 5 * 86_400_000)).toBeNull();
  });
});

describe('toDisplayText', () => {
  it('strips control characters from attacker-controlled metadata', () => {
    expect(toDisplayText('AB\u0000C\u001B[31m', 32)).toBe('ABC[31m');
  });

  it('strips bidi overrides that could reverse surrounding text', () => {
    expect(toDisplayText('SAFE\u202Ednegorp\u202C', 32)).toBe('SAFEdnegorp');
  });

  it('strips zero-width padding used to fake uniqueness', () => {
    expect(toDisplayText('BON\u200BK', 32)).toBe('BONK');
  });

  it('collapses whitespace and trims', () => {
    expect(toDisplayText('  Long   Cat \n Coin ', 40)).toBe('Long Cat Coin');
  });

  it('truncates a name long enough to break layout', () => {
    const result = toDisplayText('A'.repeat(5_000), 48);
    expect(result).toHaveLength(48);
    expect(result!.endsWith('…')).toBe(true);
  });

  it('returns null for empty or non-string input', () => {
    expect(toDisplayText('', 10)).toBeNull();
    expect(toDisplayText('   ', 10)).toBeNull();
    expect(toDisplayText(123, 10)).toBeNull();
    expect(toDisplayText(null, 10)).toBeNull();
  });
});

describe('toSafeUrl', () => {
  it('accepts http and https', () => {
    expect(toSafeUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(toSafeUrl('http://example.com/')).toBe('http://example.com/');
  });

  it('rejects schemes that could execute or exfiltrate', () => {
    expect(toSafeUrl('javascript:alert(1)')).toBeNull();
    expect(toSafeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(toSafeUrl('file:///etc/passwd')).toBeNull();
    expect(toSafeUrl('  javascript:alert(1)  ')).toBeNull();
  });

  it('rejects garbage and oversized input', () => {
    expect(toSafeUrl('not a url')).toBeNull();
    expect(toSafeUrl(`https://example.com/${'a'.repeat(3_000)}`)).toBeNull();
    expect(toSafeUrl(null)).toBeNull();
  });
});

describe('toSolanaAddress', () => {
  it('accepts a well-formed base58 address', () => {
    expect(toSolanaAddress(VALID_ADDRESS)).toBe(VALID_ADDRESS);
  });

  it('rejects wrong length, wrong alphabet, and injection attempts', () => {
    expect(toSolanaAddress('abc')).toBeNull();
    // 0, O, I and l are not in the base58 alphabet.
    expect(toSolanaAddress('0OIl'.repeat(11))).toBeNull();
    expect(toSolanaAddress(`${VALID_ADDRESS}/../../admin`)).toBeNull();
    expect(toSolanaAddress(`${VALID_ADDRESS}?x=1`)).toBeNull();
    expect(toSolanaAddress(null)).toBeNull();
  });
});

describe('normalizeTokenRef', () => {
  it('normalises a well-formed payload', () => {
    const ref = normalizeTokenRef({
      address: VALID_ADDRESS,
      symbol: 'ABC',
      name: 'Alpha Beta',
      logoURI: 'https://cdn.example.com/a.png',
    });

    expect(ref).toEqual({
      address: VALID_ADDRESS,
      symbol: 'ABC',
      name: 'Alpha Beta',
      logoUri: 'https://cdn.example.com/a.png',
      chain: 'solana',
    });
  });

  it('returns null without a usable address', () => {
    expect(normalizeTokenRef({ symbol: 'ABC' })).toBeNull();
    expect(normalizeTokenRef(null)).toBeNull();
    expect(normalizeTokenRef('nope')).toBeNull();
    expect(normalizeTokenRef([])).toBeNull();
  });

  it('falls back to an address stub when the symbol is unusable', () => {
    const ref = normalizeTokenRef({ address: VALID_ADDRESS, symbol: '\u0000\u200B' });
    expect(ref!.symbol).toBe('7xKX…');
    expect(ref!.name).toBe('Unknown token');
  });

  it('drops a logo URL that is not http(s)', () => {
    const ref = normalizeTokenRef({ address: VALID_ADDRESS, symbol: 'X', logoUri: 'javascript:alert(1)' });
    expect(ref!.logoUri).toBeNull();
  });
});

describe('normalizeMarket', () => {
  it('coerces string numerics from a REST payload', () => {
    const market = normalizeMarket({
      priceUsd: '0.0000124',
      marketCap: '1240000',
      liquidity: '150000',
      change1h: '14.5',
      txns1h: { buys: '420', sells: '210' },
    });

    expect(market.priceUsd).toBeCloseTo(0.0000124, 12);
    expect(market.marketCapUsd).toBe(1_240_000);
    expect(market.liquidityUsd).toBe(150_000);
    expect(market.change1h).toBe(14.5);
    expect(market.txns1h).toEqual({ buys: 420, sells: 210 });
  });

  it('degrades every field to null for a garbage payload rather than throwing', () => {
    for (const input of [null, undefined, 'string', 42, [], { txns1h: 'not an object' }]) {
      const market = normalizeMarket(input);
      expect(market.priceUsd).toBeNull();
      expect(market.txns1h).toEqual({ buys: null, sells: null });
    }
  });
});

describe('normalizeTokenDetail', () => {
  it('assembles a full payload and drops malformed wallet events', () => {
    const detail = normalizeTokenDetail({
      address: VALID_ADDRESS,
      symbol: 'ABC',
      market: { priceUsd: 1 },
      security: { mintAuthorityRevoked: 'true', top10HolderPct: '23' },
      smartMoney: {
        netFlow24hUsd: '5000',
        events: [
          { id: 'a', address: VALID_ADDRESS, action: 'buy', amountUsd: 1_000, at: Date.now(), tag: 'whale' },
          { address: 'bogus', action: 'buy', amountUsd: 1_000, at: Date.now() },
          { address: VALID_ADDRESS, action: 'teleport', amountUsd: 1_000, at: Date.now() },
          null,
        ],
      },
      social: { authenticity: 'organic', links: { twitter: 'javascript:alert(1)' } },
    });

    expect(detail).not.toBeNull();
    expect(detail!.security.mintAuthorityRevoked).toBe(true);
    expect(detail!.security.top10HolderPct).toBe(23);
    expect(detail!.smartMoney.events).toHaveLength(1);
    expect(detail!.social.links.twitter).toBeNull();
  });

  it('defaults an unrecognised authenticity value to unknown', () => {
    const detail = normalizeTokenDetail({ address: VALID_ADDRESS, social: { authenticity: 'definitely-real' } });
    expect(detail!.social.authenticity).toBe('unknown');
  });

  it('returns null when identity cannot be established', () => {
    expect(normalizeTokenDetail({ market: { priceUsd: 1 } })).toBeNull();
    expect(normalizeTokenDetail(undefined)).toBeNull();
  });
});

describe('normalizeCandles', () => {
  const t = 1_700_000_000_000;

  it('sorts chronologically and keeps well-formed candles', () => {
    const candles = normalizeCandles([
      { t: t + 60_000, o: 2, h: 3, l: 1, c: 2.5, v: 10 },
      { t, o: 1, h: 2, l: 0.5, c: 1.5, v: 5 },
    ]);

    expect(candles).toHaveLength(2);
    expect(candles[0]!.t).toBe(t);
    expect(candles[1]!.t).toBe(t + 60_000);
  });

  it('drops candles that are internally impossible', () => {
    const candles = normalizeCandles([
      { t, o: 1, h: 0.5, l: 2, c: 1.5 }, // high below low
      { t: t + 1_000, o: 1, h: 2, l: 0.5, c: 9 }, // close above high
      { t: t + 2_000, o: 0, h: 2, l: 0.5, c: 1 }, // zero open
      { t: t + 3_000, o: 1, h: 2, l: 0.5, c: 1.5 }, // valid
    ]);

    expect(candles).toHaveLength(1);
    expect(candles[0]!.c).toBe(1.5);
  });

  it('deduplicates repeated timestamps', () => {
    const candles = normalizeCandles([
      { t, o: 1, h: 2, l: 0.5, c: 1 },
      { t, o: 1, h: 2, l: 0.5, c: 1.8 },
    ]);
    expect(candles).toHaveLength(1);
  });

  it('returns an empty array for non-array input', () => {
    expect(normalizeCandles(null)).toEqual([]);
    expect(normalizeCandles({ candles: [] })).toEqual([]);
    expect(normalizeCandles('nope')).toEqual([]);
  });

  it('defaults missing volume to zero rather than dropping the candle', () => {
    const candles = normalizeCandles([{ t, o: 1, h: 2, l: 0.5, c: 1.5 }]);
    expect(candles[0]!.v).toBe(0);
  });
});
