export type Slot = {
  start_at: Date;
  end_at: Date;
};

export type AppointmentStatus = 
  | 'requested'
  | 'confirmed' 
  | 'pending'
  | 'cancelled'
  | 'rescheduled'
  | 'no_show'
  | 'attended';

export type BookingConflict = {
  type: 'conflict';
  message: string;
  slot?: Slot;
};