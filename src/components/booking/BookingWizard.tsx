'use client';

import { useEffect, useReducer } from 'react';
import { ConfirmStep } from './ConfirmStep';
import { ProviderStep } from './ProviderStep';
import { ResultStep } from './ResultStep';
import { ServiceStep } from './ServiceStep';
import { SlotStep } from './SlotStep';
import { StepIndicator } from './StepIndicator';
import { StepShell } from './StepShell';
import {
  canAdvanceTo,
  initState,
  type Provider,
  type Service,
  type Slot,
  wizardReducer,
} from './wizard-state';

const PUBLIC_API = '/api/booking';
const ADMIN_API = '/api/admin/booking';

type ApiSlot = { startAt: string; endAt: string };

function toSlot(apiSlot: ApiSlot): Slot {
  return {
    start_at: new Date(apiSlot.startAt),
    end_at: new Date(apiSlot.endAt),
  };
}

function toApiSlot(slot: Slot): ApiSlot {
  return {
    startAt: slot.start_at.toISOString(),
    endAt: slot.end_at.toISOString(),
  };
}

export function BookingWizard({
  mode,
  siteKey,
}: {
  mode: 'public' | 'internal';
  siteKey?: string;
}) {
  const apiBase = mode === 'internal' ? ADMIN_API : PUBLIC_API;
  const [state, dispatch] = useReducer(wizardReducer, initState());

  useEffect(() => {
    let cancelled = false;

    async function loadServices() {
      const res = await fetch(`${apiBase}/services`);
      if (!res.ok) {
        dispatch({
          type: 'ERROR',
          error: 'No se pudieron cargar los servicios.',
        });
        return;
      }
      const { services }: { services: Service[] } = await res.json();
      if (!cancelled) {
        dispatch({ type: 'SET_SERVICES', services });
      }
    }

    loadServices();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.step !== 'provider' || !state.service) return;

    let cancelled = false;

    async function loadProviders() {
      const res = await fetch(`${apiBase}/providers`);
      if (!res.ok) {
        dispatch({
          type: 'ERROR',
          error: 'No se pudieron cargar los especialistas.',
        });
        return;
      }
      const { providers }: { providers: Provider[] } = await res.json();
      if (!cancelled) {
        dispatch({ type: 'SET_PROVIDERS', providers });
      }
    }

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, [state.step, state.service]);

  useEffect(() => {
    if (
      state.step !== 'slots' ||
      !state.date ||
      !state.service ||
      !state.provider
    ) {
      return;
    }

    let cancelled = false;

    async function loadSlots() {
      const params = new URLSearchParams({
        providerId: state.provider!.id,
        serviceId: state.service!.id,
        date: state.date,
      });
      const res = await fetch(`${apiBase}/slots?${params.toString()}`);
      if (!res.ok) {
        dispatch({
          type: 'ERROR',
          error: 'No se pudieron cargar los horarios.',
        });
        return;
      }
      const { slots }: { slots: ApiSlot[] } = await res.json();
      if (!cancelled) {
        dispatch({ type: 'SET_SLOTS', slots: slots.map(toSlot) });
      }
    }

    loadSlots();
    return () => {
      cancelled = true;
    };
  }, [state.step, state.date, state.service, state.provider]);

  async function handleConfirm(patient: {
    phone: string;
    fullName: string;
    patientId?: string;
    captchaToken?: string;
  }) {
    if (!state.service || !state.provider || !state.slot) return;

    dispatch({ type: 'SUBMIT' });

    if (patient.patientId) {
      dispatch({ type: 'SET_PATIENT_ID', patientId: patient.patientId });
    }
    if (patient.captchaToken) {
      dispatch({ type: 'SET_CAPTCHA', token: patient.captchaToken });
    }

    const body: Record<string, unknown> = {
      serviceId: state.service.id,
      providerId: state.provider.id,
      ...toApiSlot(state.slot),
    };

    if (patient.patientId) {
      body.patientId = patient.patientId;
    } else {
      body.phone = patient.phone;
      body.fullName = patient.fullName;
    }

    if (patient.captchaToken) {
      body.captchaToken = patient.captchaToken;
    }

    const res = await fetch(`${apiBase}/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status !== 409) {
      dispatch({
        type: 'ERROR',
        error: 'No se pudo completar la reserva. Intenta de nuevo.',
      });
      return;
    }

    const data = await res.json();

    if (res.status === 409) {
      dispatch({
        type: 'CONFLICT',
        conflict: {
          message: data.message,
          nextAvailable: data.nextAvailable
            ? toSlot(data.nextAvailable)
            : null,
        },
      });
      return;
    }

    dispatch({
      type: 'BOOKED',
      confirmation: {
        ...data.confirmation,
        serviceName: state.service.name,
        providerName: state.provider.name,
      },
    });
  }

  function handleAcceptNext() {
    if (state.conflict?.nextAvailable) {
      dispatch({
        type: 'SELECT_SLOT',
        slot: state.conflict.nextAvailable,
      });
    }
  }

  const stepNumber =
    state.step === 'service'
      ? 1
      : state.step === 'provider'
        ? 2
        : state.step === 'slots'
          ? 3
          : state.step === 'confirm'
            ? 4
            : 5;

  return (
    <div className="mx-auto max-w-2xl p-4">
      <StepIndicator current={stepNumber} />

      {state.step === 'service' && (
        <StepShell title="Elige un servicio">
          <ServiceStep
            services={state.services ?? []}
            loading={state.services === null}
            error={state.error}
            onSelect={(service) => dispatch({ type: 'SELECT_SERVICE', service })}
            onRetry={() => window.location.reload()}
          />
        </StepShell>
      )}

      {state.step === 'provider' && (
        <StepShell
          title="Elige un especialista"
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'service' })}
        >
          <ProviderStep
            providers={state.providers ?? []}
            loading={state.providers === null}
            error={state.error}
            onSelect={(provider) =>
              dispatch({ type: 'SELECT_PROVIDER', provider })
            }
            onRetry={() => dispatch({ type: 'GO_TO_STEP', step: 'service' })}
          />
        </StepShell>
      )}

      {state.step === 'slots' && (
        <StepShell
          title="Elige un horario"
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'provider' })}
        >
          <SlotStep
            date={state.date}
            slots={state.slots ?? []}
            loading={state.slots === null && state.date !== ''}
            error={state.error}
            onDateChange={(date) => dispatch({ type: 'SELECT_DATE', date })}
            onSelect={(slot) => dispatch({ type: 'SELECT_SLOT', slot })}
            onRetry={() =>
              dispatch({ type: 'SELECT_DATE', date: state.date })
            }
          />
        </StepShell>
      )}

      {state.step === 'confirm' && state.service && state.provider && state.slot && (
        <StepShell
          title="Confirma tu cita"
          onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'slots' })}
        >
          <ConfirmStep
            mode={mode}
            service={state.service}
            provider={state.provider}
            slot={state.slot}
            onConfirm={handleConfirm}
            onBack={() => dispatch({ type: 'GO_TO_STEP', step: 'slots' })}
            loading={state.phase === 'loading'}
            error={state.error}
            siteKey={siteKey}
          />
        </StepShell>
      )}

      {state.step === 'result' && (
        <StepShell title="Resultado de tu reserva">
          <ResultStep
            confirmation={state.confirmation}
            conflict={state.conflict}
            onAcceptNext={handleAcceptNext}
            onDecline={() => dispatch({ type: 'GO_TO_STEP', step: 'slots' })}
          />
        </StepShell>
      )}
    </div>
  );
}
