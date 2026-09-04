export type Patient = {
  id: string;
  fullName: string;
  phoneE164: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PatientInput = {
  fullName: string;
  phoneE164: string;
  notes?: string | null;
};

export type Provider = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderInput = {
  name: string;
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
