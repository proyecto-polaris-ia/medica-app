import { describe, expect, it } from 'vitest';
import {
  canAdvanceTo,
  initState,
  wizardReducer,
  type WizardState,
} from './wizard-state';

const sampleService = { id: 'svc-1', name: 'Consulta', durationMinutes: 30 };
const sampleProvider = { id: 'pro-1', name: 'Dra. Ana López' };
const sampleSlot = {
  start_at: new Date('2026-09-10T14:00:00.000Z'),
  end_at: new Date('2026-09-10T14:30:00.000Z'),
};

describe('initState', () => {
  it('starts on the service step with no selections', () => {
    const state = initState();

    expect(state.step).toBe('service');
    expect(state.service).toBeNull();
    expect(state.provider).toBeNull();
    expect(state.slot).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('initializes patientId and captchaToken as null', () => {
    const state = initState();

    expect(state.patientId).toBeNull();
    expect(state.captchaToken).toBeNull();
  });
});

describe('canAdvanceTo', () => {
  it('allows provider only after a service is selected', () => {
    expect(canAdvanceTo(initState(), 'provider')).toBe(false);

    const withService = wizardReducer(initState(), {
      type: 'SELECT_SERVICE',
      service: sampleService,
    });

    expect(canAdvanceTo(withService, 'provider')).toBe(true);
  });

  it('allows slots only after service and provider are selected', () => {
    const withService = wizardReducer(initState(), {
      type: 'SELECT_SERVICE',
      service: sampleService,
    });

    expect(canAdvanceTo(withService, 'slots')).toBe(false);

    const withProvider = wizardReducer(withService, {
      type: 'SELECT_PROVIDER',
      provider: sampleProvider,
    });

    expect(canAdvanceTo(withProvider, 'slots')).toBe(true);
  });

  it('allows confirm only after a slot is selected', () => {
    const withProvider = wizardReducer(
      wizardReducer(initState(), {
        type: 'SELECT_SERVICE',
        service: sampleService,
      }),
      { type: 'SELECT_PROVIDER', provider: sampleProvider }
    );

    expect(canAdvanceTo(withProvider, 'confirm')).toBe(false);

    const withSlot = wizardReducer(withProvider, {
      type: 'SELECT_SLOT',
      slot: sampleSlot,
    });

    expect(canAdvanceTo(withSlot, 'confirm')).toBe(true);
  });
});

describe('no skipping ahead', () => {
  it('ignores attempts to jump past an uncompleted step', () => {
    const state = wizardReducer(initState(), {
      type: 'GO_TO_STEP',
      step: 'confirm',
    });

    expect(state.step).toBe('service');
  });

  it('allows moving back to a completed step', () => {
    const withSlot = wizardReducer(
      wizardReducer(
        wizardReducer(initState(), {
          type: 'SELECT_SERVICE',
          service: sampleService,
        }),
        { type: 'SELECT_PROVIDER', provider: sampleProvider }
      ),
      { type: 'SELECT_SLOT', slot: sampleSlot }
    );

    const backToService = wizardReducer(withSlot, {
      type: 'GO_TO_STEP',
      step: 'service',
    });

    expect(backToService.step).toBe('service');
  });
});

describe('conflict transition', () => {
  it('moves to the result step with conflict details', () => {
    const withSlot = wizardReducer(
      wizardReducer(
        wizardReducer(initState(), {
          type: 'SELECT_SERVICE',
          service: sampleService,
        }),
        { type: 'SELECT_PROVIDER', provider: sampleProvider }
      ),
      { type: 'SELECT_SLOT', slot: sampleSlot }
    );

    const conflict = {
      message: 'El horario ya no está disponible.',
      nextAvailable: {
        start_at: new Date('2026-09-10T15:00:00.000Z'),
        end_at: new Date('2026-09-10T15:30:00.000Z'),
      },
    };

    const state = wizardReducer(withSlot, {
      type: 'CONFLICT',
      conflict,
    });

    expect(state.step).toBe('result');
    expect(state.phase).toBe('idle');
    expect(state.conflict).toEqual(conflict);
  });
});

describe('reset', () => {
  it('clears all selections and returns to the service step', () => {
    const filled: WizardState = {
      ...initState(),
      step: 'confirm',
      service: sampleService,
      provider: sampleProvider,
      slot: sampleSlot,
    };

    const reset = wizardReducer(filled, { type: 'RESET' });

    expect(reset.step).toBe('service');
    expect(reset.service).toBeNull();
    expect(reset.provider).toBeNull();
    expect(reset.slot).toBeNull();
    expect(reset.conflict).toBeNull();
  });

  it('clears patientId and captchaToken on reset', () => {
    const filled: WizardState = {
      ...initState(),
      patientId: 'pat-1',
      captchaToken: 'token-1',
    };

    const reset = wizardReducer(filled, { type: 'RESET' });

    expect(reset.patientId).toBeNull();
    expect(reset.captchaToken).toBeNull();
  });
});

describe('internal mode state', () => {
  it('sets the selected patient id', () => {
    const state = wizardReducer(initState(), {
      type: 'SET_PATIENT_ID',
      patientId: 'pat-1',
    });

    expect(state.patientId).toBe('pat-1');
  });
});

describe('public mode state', () => {
  it('sets the captcha token', () => {
    const state = wizardReducer(initState(), {
      type: 'SET_CAPTCHA',
      token: 'captcha-token',
    });

    expect(state.captchaToken).toBe('captcha-token');
  });

  it('clears the captcha token on expire', () => {
    const filled = wizardReducer(initState(), {
      type: 'SET_CAPTCHA',
      token: 'captcha-token',
    });

    const state = wizardReducer(filled, { type: 'SET_CAPTCHA', token: null });

    expect(state.captchaToken).toBeNull();
  });
});

it('stores an internal email alongside the optional phone', () => {
  const state = wizardReducer(initState(), { type: 'SET_PATIENT', patient: { fullName: 'María', phone: '', email: 'maria@example.com' } });
  expect(state.patient).toEqual({ fullName: 'María', phone: '', email: 'maria@example.com' });
});
