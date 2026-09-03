-- Down migration for agenda functions

DROP FUNCTION IF EXISTS booking_free_slots(uuid, interval, date, text);