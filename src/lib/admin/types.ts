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


export type PregnancyStatus = 'not_applicable' | 'no' | 'yes';
export type SmokingStatus = 'never' | 'former' | 'current';
export type AlcoholStatus = 'never' | 'occasional' | 'frequent';

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

export type PatientRecordAppointment = Appointment & {
  serviceName: string;
  providerName: string;
};

export type PatientRecord = {
  patient: Patient;
  upcomingAppointments: PatientRecordAppointment[];
  attendedAppointments: PatientRecordAppointment[];
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
