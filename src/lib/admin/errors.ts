export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(
    message = 'The requested operation conflicts with existing data.',
    public code = 'conflict'
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}
