import type { FollowUpReason } from './rules';

/**
 * Tipos de dominio de la capa de datos de seguimiento (follow-up).
 *
 * Los errores y la validación se reutilizan de `../errors` y `../validate`; este
 * módulo no define una jerarquía paralela.
 */

export type FollowUpContactStatus = 'contacted' | 'dismissed';

export type FollowUpContact = {
  id: string;
  patientId: string;
  roundDate: string;
  status: FollowUpContactStatus;
  contactedAt: string | null;
  dismissedAt: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpCase = {
  patientId: string;
  patientName: string;
  patientPhoneE164: string | null;
  reason: FollowUpReason;
  reasonLabel: string;
  reasonDate: string;
  roundDate: string;
  sourceAppointmentId: string | null;
  sourcePlanId: string | null;
};

export type FollowUpDraftStatus =
  | 'draft'
  | 'approved'
  | 'rejected'
  | 'sent'
  | 'sent_failed';

export type FollowUpDraft = {
  id: string;
  patientId: string;
  body: string;
  templateName: string;
  status: FollowUpDraftStatus;
  dedupKey: string;
  providerMessageId: string | null;
  errorMessage: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
