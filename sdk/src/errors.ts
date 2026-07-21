/** Base class for every error thrown by the SDK. */
export class OpenControlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenControlError";
  }
}

/** The requested room code is already hosting a session. */
export class RoomUnavailableError extends OpenControlError {
  constructor(public readonly room: string) {
    super(`Room code "${room}" is already in use`);
    this.name = "RoomUnavailableError";
  }
}

/** No host session exists for the given room code. */
export class RoomNotFoundError extends OpenControlError {
  constructor(public readonly room: string) {
    super(`No session found for room "${room}"`);
    this.name = "RoomNotFoundError";
  }
}

/** The host refused the join request (room full, wrong controller profile, …). */
export class JoinRejectedError extends OpenControlError {
  constructor(public readonly reason: string) {
    super(`Join rejected by host: ${reason}`);
    this.name = "JoinRejectedError";
  }
}

/** A connection attempt did not complete in time. */
export class ConnectionTimeoutError extends OpenControlError {
  constructor(message = "Connection timed out") {
    super(message);
    this.name = "ConnectionTimeoutError";
  }
}
