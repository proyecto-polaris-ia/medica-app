export type WizardStep = 'service' | 'provider' | 'slots' | 'confirm' | 'result';

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type Provider = {
  id: string;
  name: string;
};

export type Slot = {
  start_at: Date;
  end_at: Date;
};

export type Conflict = {
  message: string;
  nextAvailable: Slot | null;
};

export type WizardState = {
  step: WizardStep;
  service: Service | null;
  provider: Provider | null;
  date: string;
  slot: Slot | null;
  patient: { phone: string; fullName: string };
  patientId: string | null;
  captchaToken: string | null;
  phase: 'idle' | 'loading' | 'error';
  error: string | null;
  confirmation: Record<string, unknown> | null;
  conflict: Conflict | null;
  services: Service[] | null;
  providers: Provider[] | null;
  slots: Slot[] | null;
};

export type WizardAction =
  | { type: 'SELECT_SERVICE'; service: Service }
  | { type: 'SELECT_PROVIDER'; provider: Provider }
  | { type: 'SELECT_DATE'; date: string }
  | { type: 'SELECT_SLOT'; slot: Slot }
  | { type: 'SET_PATIENT'; patient: { phone: string; fullName: string } }
  | { type: 'SET_PATIENT_ID'; patientId: string | null }
  | { type: 'SET_CAPTCHA'; token: string | null }
  | { type: 'SET_SERVICES'; services: Service[] }
  | { type: 'SET_PROVIDERS'; providers: Provider[] }
  | { type: 'SET_SLOTS'; slots: Slot[] }
  | { type: 'SUBMIT' }
  | { type: 'BOOKED'; confirmation: Record<string, unknown> }
  | { type: 'CONFLICT'; conflict: Conflict }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' }
  | { type: 'GO_TO_STEP'; step: WizardStep };

export function initState(): WizardState {
  return {
    step: 'service',
    service: null,
    provider: null,
    date: '',
    slot: null,
    patient: { phone: '', fullName: '' },
    patientId: null,
    captchaToken: null,
    phase: 'idle',
    error: null,
    confirmation: null,
    conflict: null,
    services: null,
    providers: null,
    slots: null,
  };
}

export function canAdvanceTo(
  state: WizardState,
  step: WizardStep
): boolean {
  switch (step) {
    case 'service':
      return true;
    case 'provider':
      return state.service !== null;
    case 'slots':
      return state.service !== null && state.provider !== null;
    case 'confirm':
      return (
        state.service !== null &&
        state.provider !== null &&
        state.slot !== null
      );
    case 'result':
      return (
        state.service !== null &&
        state.provider !== null &&
        state.slot !== null
      );
    default:
      return false;
  }
}

export function wizardReducer(
  state: WizardState,
  action: WizardAction
): WizardState {
  switch (action.type) {
    case 'SELECT_SERVICE':
      return {
        ...state,
        service: action.service,
        provider: null,
        providers: null,
        slot: null,
        slots: null,
        date: '',
        step: 'provider',
        error: null,
        conflict: null,
      };

    case 'SELECT_PROVIDER':
      return {
        ...state,
        provider: action.provider,
        slot: null,
        slots: null,
        date: '',
        step: 'slots',
        error: null,
        conflict: null,
      };

    case 'SELECT_DATE':
      return {
        ...state,
        date: action.date,
        slot: null,
        slots: null,
        error: null,
      };

    case 'SELECT_SLOT':
      return {
        ...state,
        slot: action.slot,
        step: 'confirm',
        error: null,
        conflict: null,
      };

    case 'SET_PATIENT':
      return { ...state, patient: action.patient, error: null };

    case 'SET_PATIENT_ID':
      return { ...state, patientId: action.patientId, error: null };

    case 'SET_CAPTCHA':
      return { ...state, captchaToken: action.token, error: null };

    case 'SET_SERVICES':
      return { ...state, services: action.services, phase: 'idle', error: null };

    case 'SET_PROVIDERS':
      return {
        ...state,
        providers: action.providers,
        phase: 'idle',
        error: null,
      };

    case 'SET_SLOTS':
      return { ...state, slots: action.slots, phase: 'idle', error: null };

    case 'SUBMIT':
      return { ...state, phase: 'loading', error: null };

    case 'BOOKED':
      return {
        ...state,
        step: 'result',
        phase: 'idle',
        confirmation: action.confirmation,
        conflict: null,
      };

    case 'CONFLICT':
      return {
        ...state,
        step: 'result',
        phase: 'idle',
        conflict: action.conflict,
      };

    case 'ERROR':
      return { ...state, phase: 'error', error: action.error };

    case 'RESET':
      return initState();

    case 'GO_TO_STEP':
      return canAdvanceTo(state, action.step)
        ? { ...state, step: action.step, error: null }
        : state;

    default:
      return state;
  }
}
