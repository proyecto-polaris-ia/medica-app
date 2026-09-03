import { Slot } from './types';

export type BookingState = {
  selectedSlot: Slot | null;
  candidates: Slot[];
  step: 'init' | 'selecting' | 'confirming' | 'completed';
};

export function initState(): BookingState {
  return {
    selectedSlot: null,
    candidates: [],
    step: 'init'
  };
}

export function selectSlot(state: BookingState, slot: Slot): BookingState {
  return {
    ...state,
    selectedSlot: slot,
    step: 'confirming'
  };
}

export function setCandidates(state: BookingState, candidates: Slot[]): BookingState {
  return {
    ...state,
    candidates,
    step: 'selecting'
  };
}

export function confirmBooking(state: BookingState): BookingState {
  return {
    ...state,
    step: 'completed'
  };
}