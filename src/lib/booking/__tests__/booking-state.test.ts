import { describe, it, expect } from 'vitest';
import { initState, selectSlot, setCandidates, confirmBooking } from '../booking-state';
import { Slot } from '../types';

describe('booking-state', () => {
  it('should initialize with correct default state', () => {
    const state = initState();
    expect(state.selectedSlot).toBeNull();
    expect(state.candidates).toEqual([]);
    expect(state.step).toBe('init');
  });

  it('should select a slot correctly', () => {
    const state = initState();
    const slot: Slot = {
      start_at: new Date('2023-01-01T10:00:00Z'),
      end_at: new Date('2023-01-01T10:30:00Z')
    };
    
    const newState = selectSlot(state, slot);
    expect(newState.selectedSlot).toBe(slot);
    expect(newState.step).toBe('confirming');
  });

  it('should set candidates correctly', () => {
    const state = initState();
    const candidates: Slot[] = [
      {
        start_at: new Date('2023-01-01T10:00:00Z'),
        end_at: new Date('2023-01-01T10:30:00Z')
      },
      {
        start_at: new Date('2023-01-01T11:00:00Z'),
        end_at: new Date('2023-01-01T11:30:00Z')
      }
    ];
    
    const newState = setCandidates(state, candidates);
    expect(newState.candidates).toEqual(candidates);
    expect(newState.step).toBe('selecting');
  });

  it('should confirm booking correctly', () => {
    const state = initState();
    const newState = confirmBooking(state);
    expect(newState.step).toBe('completed');
  });
});