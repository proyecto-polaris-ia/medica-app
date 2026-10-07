import { describe, expect, it } from 'vitest';
import { computeSuggestions, NORA_MAX_SUGGESTIONS } from '../suggestions';
import {
  type NoraGap,
  type NoraMovableAppointment,
  type NoraSuggestion,
} from '../types';
import type { MetricAppointment } from '../../metrics/types';

const MX_OFFSET_HOURS = 6;

/** Instante UTC de una hora local en America/Mexico_City (UTC−6 fijo). */
function mx(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(
    Date.UTC(year, month - 1, day, hour + MX_OFFSET_HOURS, minute)
  ).toISOString();
}

function gap(overrides: Partial<NoraGap> = {}): NoraGap {
  return {
    providerId: 'p1',
    dayKey: '2026-10-01',
    startAt: mx(2026, 10, 1, 9),
    endAt: mx(2026, 10, 1, 10),
    minutes: 60,
    ...overrides,
  };
}

function movable(
  overrides: Partial<NoraMovableAppointment> = {}
): NoraMovableAppointment {
  return {
    id: 'a1',
    providerId: 'p1',
    startAt: mx(2026, 10, 1, 10),
    endAt: mx(2026, 10, 1, 11),
    status: 'confirmed',
    serviceDurationMinutes: 60,
    ...overrides,
  };
}

function active(overrides: Partial<MetricAppointment> = {}): MetricAppointment {
  return {
    id: 'a1',
    providerId: 'p1',
    startAt: mx(2026, 10, 1, 10),
    endAt: mx(2026, 10, 1, 11),
    status: 'confirmed',
    ...overrides,
  };
}

describe('computeSuggestions', () => {
  it('propone mover la cita a un hueco real del mismo proveedor', () => {
    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 15), minutes: 60 })],
      movableAppointments: [movable()],
      activeAppointments: [active()],
    });

    expect(suggestions).toEqual<NoraSuggestion[]>([
      {
        appointmentId: 'a1',
        providerId: 'p1',
        suggestedStartAt: mx(2026, 10, 1, 14),
        suggestedEndAt: mx(2026, 10, 1, 15),
        reasonCode: 'gap_after',
      },
    ]);
  });

  it('no genera sugerencia cuando ningún hueco alcanza la duración del servicio', () => {
    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 14, 30), minutes: 30 })],
      movableAppointments: [movable({ serviceDurationMinutes: 60 })],
      activeAppointments: [active()],
    });

    expect(suggestions).toEqual([]);
  });

  it('toda hora sugerida deriva de un hueco detectado: nunca inventa disponibilidad', () => {
    const gaps = [
      gap({ startAt: mx(2026, 10, 1, 8), endAt: mx(2026, 10, 1, 9), minutes: 60 }),
      gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 16), minutes: 120 }),
    ];
    const suggestions = computeSuggestions({
      gaps,
      movableAppointments: [movable()],
      activeAppointments: [active()],
    });

    const validStarts = new Set(gaps.map((g) => g.startAt));
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(validStarts.has(suggestion.suggestedStartAt)).toBe(true);
      expect(suggestion.suggestedEndAt).toBe(
        new Date(Date.parse(suggestion.suggestedStartAt) + 60 * 60_000).toISOString()
      );
    }
  });

  it('usa gap_before cuando el hueco destino es anterior al inicio actual', () => {
    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 8), endAt: mx(2026, 10, 1, 9), minutes: 60 })],
      movableAppointments: [movable({ startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 11) })],
      activeAppointments: [active()],
    });

    expect(suggestions.map((s) => s.reasonCode)).toEqual(['gap_before']);
  });

  it('usa gap_between cuando el hueco queda entre dos citas activas', () => {
    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 12), minutes: 120 })],
      movableAppointments: [
        movable({ id: 'late', startAt: mx(2026, 10, 1, 15), endAt: mx(2026, 10, 1, 16) }),
      ],
      activeAppointments: [
        active({ id: 'before', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 10) }),
        active({ id: 'after', startAt: mx(2026, 10, 1, 12), endAt: mx(2026, 10, 1, 13) }),
        active({ id: 'late', startAt: mx(2026, 10, 1, 15), endAt: mx(2026, 10, 1, 16) }),
      ],
    });

    expect(suggestions.map((s) => s.reasonCode)).toEqual(['gap_between']);
  });

  it('una cita en estado terminal no es movible', () => {
    const terminal = {
      ...movable({ status: 'confirmed' as const }),
      status: 'cancelled',
    } as unknown as NoraMovableAppointment;

    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 15), minutes: 60 })],
      movableAppointments: [terminal],
      activeAppointments: [],
    });

    expect(suggestions).toEqual([]);
  });

  it('una cita que ya inicia en el hueco no se propone mover', () => {
    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 12), minutes: 120 })],
      movableAppointments: [movable({ startAt: mx(2026, 10, 1, 10), endAt: mx(2026, 10, 1, 11) })],
      activeAppointments: [active()],
    });

    expect(suggestions).toEqual([]);
  });

  it('acota la lista a maxSuggestions', () => {
    const movableAppointments = Array.from({ length: 5 }, (_, index) =>
      movable({
        id: `a${index}`,
        startAt: mx(2026, 10, 1, 10 + index * 2),
        endAt: mx(2026, 10, 1, 11 + index * 2),
      })
    );
    const gaps = Array.from({ length: 5 }, (_, index) =>
      gap({ startAt: mx(2026, 10, 1, 20 + index), endAt: mx(2026, 10, 1, 21 + index) })
    );

    const suggestions = computeSuggestions({
      gaps,
      movableAppointments,
      activeAppointments: movableAppointments.map((a) => active(a)),
      maxSuggestions: 2,
    });

    expect(suggestions).toHaveLength(2);
  });

  it('expone un máximo por defecto acotado', () => {
    expect(NORA_MAX_SUGGESTIONS).toBe(20);
  });

  it('ordena de forma determinista por proveedor, hora sugerida y cita', () => {
    const suggestions = computeSuggestions({
      gaps: [
        gap({ providerId: 'p2', startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 15), minutes: 60 }),
        gap({ providerId: 'p1', startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 16), minutes: 120 }),
        gap({ providerId: 'p1', startAt: mx(2026, 10, 1, 9), endAt: mx(2026, 10, 1, 10), minutes: 60 }),
      ],
      movableAppointments: [
        // b requiere 90 min: no cabe en el hueco de 09:00 y va al de 14:00.
        movable({ id: 'b', providerId: 'p1', startAt: mx(2026, 10, 1, 17), endAt: mx(2026, 10, 1, 18), serviceDurationMinutes: 90 }),
        movable({ id: 'a', providerId: 'p1', startAt: mx(2026, 10, 1, 16), endAt: mx(2026, 10, 1, 17), serviceDurationMinutes: 60 }),
        movable({ id: 'c', providerId: 'p2', startAt: mx(2026, 10, 1, 16), endAt: mx(2026, 10, 1, 17), serviceDurationMinutes: 60 }),
      ],
      activeAppointments: [],
    });

    expect(
      suggestions.map((s) => `${s.providerId}:${s.suggestedStartAt}:${s.appointmentId}`)
    ).toEqual([
      `p1:${mx(2026, 10, 1, 9)}:a`,
      `p1:${mx(2026, 10, 1, 14)}:b`,
      `p2:${mx(2026, 10, 1, 14)}:c`,
    ]);
  });

  it('TRIANGULATE: el mejor candidato por cita desempata por endAt más temprano', () => {
    const suggestions = computeSuggestions({
      gaps: [
        gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 16), minutes: 120 }),
        gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 15), minutes: 60 }),
      ],
      movableAppointments: [
        movable({ id: 'late', startAt: mx(2026, 10, 1, 17), endAt: mx(2026, 10, 1, 18) }),
      ],
      activeAppointments: [
        active({ id: 'before', startAt: mx(2026, 10, 1, 13), endAt: mx(2026, 10, 1, 14) }),
        active({ id: 'after', startAt: mx(2026, 10, 1, 15), endAt: mx(2026, 10, 1, 16) }),
        active({ id: 'late', startAt: mx(2026, 10, 1, 17), endAt: mx(2026, 10, 1, 18) }),
      ],
    });

    // El hueco 14:00–15:00 queda entre dos citas (gap_between) y gana por endAt.
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].reasonCode).toBe('gap_between');
    expect(suggestions[0].suggestedStartAt).toBe(mx(2026, 10, 1, 14));
    expect(suggestions[0].suggestedEndAt).toBe(mx(2026, 10, 1, 15));
  });

  it('TRIANGULATE: acepta un hueco exactamente igual a la duración del servicio', () => {
    const suggestions = computeSuggestions({
      gaps: [gap({ startAt: mx(2026, 10, 1, 14), endAt: mx(2026, 10, 1, 15), minutes: 60 })],
      movableAppointments: [movable({ serviceDurationMinutes: 60 })],
      activeAppointments: [active()],
    });

    expect(suggestions).toHaveLength(1);
  });

  it('TRIANGULATE: cero citas movibles o cero huecos produce lista vacía', () => {
    expect(
      computeSuggestions({
        gaps: [gap()],
        movableAppointments: [],
        activeAppointments: [],
      })
    ).toEqual([]);

    expect(
      computeSuggestions({
        gaps: [],
        movableAppointments: [movable()],
        activeAppointments: [active()],
      })
    ).toEqual([]);
  });
});
