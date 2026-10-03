import { describe, expect, it } from 'vitest';
import {
  TRANSITION_COLUMN_BY_STATUS,
  buildTransitionStamp,
} from '../transitions';

const AT = new Date('2026-09-05T18:30:00.000Z');

describe('TRANSITION_COLUMN_BY_STATUS', () => {
  it('mapea solo los tres estados estampables', () => {
    expect(TRANSITION_COLUMN_BY_STATUS).toEqual({
      confirmed: 'confirmed_at',
      cancelled: 'cancelled_at',
      no_show: 'no_show_at',
    });
  });
});

describe('buildTransitionStamp', () => {
  it('confirmed → confirmed_at con el ISO exacto', () => {
    expect(buildTransitionStamp('confirmed', AT)).toEqual({
      confirmed_at: '2026-09-05T18:30:00.000Z',
    });
  });

  it('cancelled → cancelled_at', () => {
    expect(buildTransitionStamp('cancelled', AT)).toEqual({
      cancelled_at: '2026-09-05T18:30:00.000Z',
    });
  });

  it('no_show → no_show_at', () => {
    expect(buildTransitionStamp('no_show', AT)).toEqual({
      no_show_at: '2026-09-05T18:30:00.000Z',
    });
  });

  it('requested / pending / attended / rescheduled → {}', () => {
    for (const status of ['requested', 'pending', 'attended', 'rescheduled'] as const) {
      expect(buildTransitionStamp(status, AT), status).toEqual({});
    }
  });

  it('usa el instante recibido, no un new Date() interno', () => {
    const past = new Date('2020-01-01T00:00:00.000Z');
    expect(buildTransitionStamp('confirmed', past).confirmed_at).toBe(
      '2020-01-01T00:00:00.000Z'
    );
  });
});
