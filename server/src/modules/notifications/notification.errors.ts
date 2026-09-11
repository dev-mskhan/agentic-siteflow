export class NonRetryableNotificationError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "NonRetryableNotificationError";
  }
}
