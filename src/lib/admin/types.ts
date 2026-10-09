export type Sex = 'male' | 'female' | 'other';

export type Patient = {
  id: string;
  fullName: string;
  phoneE164: string | null;
  email: string | null;
  notes: string | null;
  birthDate: string | null;
  sex: Sex | null;
  address: string | null;
  occupation: string | null;
  referralSource: string | null;
  secondaryPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelationship: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientInput = {
  fullName: string;
  phoneE164?: string | null;
  email?: string | null;
  notes?: string | null;
  birthDate?: string | null;
  sex?: Sex | null;
  address?: string | null;
  occupation?: string | null;
  referralSource?: string | null;
  secondaryPhone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelationship?: string | null;
};

export type Provider = {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProviderInput = {
  name: string;
  color?: string | null;
};

export type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceInput = {
  name: string;
  durationMinutes: number;
};

export type BusinessHour = {
  id: string;
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
};

export type BusinessHourInput = {
  providerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'pending'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'attended';

export type AppointmentReminderSummary = {
  cadence: 'h24' | 'same_day';
  status: 'scheduled' | 'sent' | 'failed';
  sentAt: string | null;
  dryRun: boolean;
  createdAt: string;
};

export type Appointment = {
  id: string;
  patientId: string | null;
  serviceId: string;
  providerId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  reminders: AppointmentReminderSummary[];
};

export type AppointmentInput = {
  patientId?: string | null;
  serviceId: string;
  providerId: string;
  startAt: string;
  endAt: string;
  status?: AppointmentStatus;
  notes?: string | null;
};

/**
 * Columnas ordenables del listado de citas (whitelist del endpoint).
 * `patient`/`service`/`provider` ordenan por el nombre de la relación
 * embebida en PostgREST; el resto son columnas directas.
 */
export const APPOINTMENT_SORT_COLUMNS = [
  'start_at',
  'end_at',
  'status',
  'created_at',
  'patient',
  'service',
  'provider',
] as const;

export type AppointmentSortColumn = (typeof APPOINTMENT_SORT_COLUMNS)[number];

/** Direcciones de ordenamiento aceptadas por el endpoint. */
export const APPOINTMENT_SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type AppointmentSortDirection =
  (typeof APPOINTMENT_SORT_DIRECTIONS)[number];


export type PregnancyStatus = 'not_applicable' | 'no' | 'yes';
export type SmokingStatus = 'never' | 'former' | 'current';
export type AlcoholStatus = 'never' | 'occasional' | 'frequent';

/** Procedencia del dato de la historia clínica. */
export type MedicalHistorySource = 'patient_autoreport' | 'staff';

export type MedicalHistory = {
  patientId: string;
  allergies: string[];
  systemicConditions: string[];
  medications: string[];
  pregnancyStatus: PregnancyStatus | null;
  coagulationDisorders: string | null;
  anticoagulants: string | null;
  surgeries: string | null;
  infectiousDiseases: string | null;
  smoking: SmokingStatus | null;
  alcohol: AlcoholStatus | null;
  dentalHistory: string | null;
  oralHabits: string[];
  clinicalNotes: string | null;
  source: MedicalHistorySource | null;
  createdAt: string;
  updatedAt: string;
};

export type MedicalHistoryInput = {
  allergies?: string[];
  systemicConditions?: string[];
  medications?: string[];
  pregnancyStatus?: PregnancyStatus | null;
  coagulationDisorders?: string | null;
  anticoagulants?: string | null;
  surgeries?: string | null;
  infectiousDiseases?: string | null;
  smoking?: SmokingStatus | null;
  alcohol?: AlcoholStatus | null;
  dentalHistory?: string | null;
  oralHabits?: string[];
  clinicalNotes?: string | null;
  source?: MedicalHistorySource | null;
};

export type ClinicalVisit = {
  id: string;
  patientId: string;
  appointmentId: string | null;
  providerId: string | null;
  subjective: string;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  treatment: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClinicalVisitInput = {
  appointmentId?: string | null;
  providerId?: string | null;
  subjective?: string;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  treatment?: string | null;
  notes?: string | null;
};

export type PatientFileCategory =
  | 'radiograph'
  | 'clinical_photo'
  | 'document'
  | 'consent'
  | 'other';

export type PatientFile = {
  id: string;
  patientId: string;
  clinicalVisitId: string | null;
  category: PatientFileCategory;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: string;
  signedUrl?: string;
};

export type PatientRecordAppointment = Omit<Appointment, 'reminders'> & {
  serviceName: string;
  providerName: string;
};

export type PatientRecord = {
  patient: Patient;
};

/** Página de citas del expediente tal como la devuelve la capa de datos. */
export type PatientAppointmentsPage = {
  appointments: PatientRecordAppointment[];
  total: number;
};

export type ProviderAppointment = {
  id: string;
  patientId: string | null;
  patientName: string;
  serviceName: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
};

export type RecentClient = {
  id: string;
  fullName: string;
  count: number;
};

export type ProviderSnapshot = {
  provider: Provider;
  upcoming: ProviderAppointment[];
  today: ProviderAppointment[];
  recentClients: RecentClient[];
  clientsHref: string;
};

export type TreatmentPlanStatus =
  | 'draft'
  | 'presented'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type TreatmentPlanItemStatus = 'pending' | 'done';

export type TreatmentPlan = {
  id: string;
  patientId: string;
  providerId: string;
  clinicalVisitId: string | null;
  name: string;
  status: TreatmentPlanStatus;
  totalAmount: number;
  acceptedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentPlanItem = {
  id: string;
  treatmentPlanId: string;
  description: string;
  serviceId: string | null;
  tooth: string | null;
  quantity: number;
  unitPrice: number;
  status: TreatmentPlanItemStatus;
  createdAt: string;
  updatedAt: string;
};

export type TreatmentPlanWithItems = TreatmentPlan & {
  items: TreatmentPlanItem[];
};

export type TreatmentPlanInput = {
  providerId: string;
  clinicalVisitId?: string | null;
  name: string;
  notes?: string | null;
  items?: TreatmentPlanItemInput[];
};

export type TreatmentPlanUpdateInput = {
  providerId?: string;
  clinicalVisitId?: string | null;
  name?: string;
  notes?: string | null;
  status?: TreatmentPlanStatus;
};

export type TreatmentPlanItemInput = {
  description: string;
  serviceId?: string | null;
  tooth?: string | null;
  quantity?: number;
  unitPrice: number;
};

export type TreatmentPlanItemUpdateInput = {
  description?: string;
  serviceId?: string | null;
  tooth?: string | null;
  quantity?: number;
  unitPrice?: number;
  status?: TreatmentPlanItemStatus;
};

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other';

export type Payment = {
  id: string;
  patientId: string;
  treatmentPlanId: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference: string | null;
  notes: string | null;
  requiresInvoice: boolean;
  createdBy: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentInput = {
  treatmentPlanId?: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string | null;
  notes?: string | null;
  requiresInvoice?: boolean;
};

export type PaymentUpdateInput = Partial<
  Pick<
    PaymentInput,
    'treatmentPlanId' | 'amount' | 'method' | 'paidAt' | 'reference' | 'notes'
  >
>;

export type PaymentReversalInput = {
  reason: string;
};

export type PlanBalance = {
  treatmentPlanId: string;
  name: string;
  status: TreatmentPlanStatus;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  baseDate: string;
  baseDateSource: 'accepted_at' | 'created_at';
  daysPastDue: number;
  isPastDue: boolean;
};

export type PatientReceivableSummary = {
  patientId: string;
  totalEligibleAmount: number;
  paidAmount: number;
  unallocatedPaidAmount: number;
  balance: number;
  creditAmount: number;
  planBalances: PlanBalance[];
  lastPaymentAt: string | null;
};

export type AccountsReceivableRow = PatientReceivableSummary & {
  patientName: string;
  patientPhoneE164: string | null;
  pastDuePlans: PlanBalance[];
};
