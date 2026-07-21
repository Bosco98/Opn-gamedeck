/**
 * Networking abstraction.
 *
 * The SDK never talks to a specific transport directly — sessions consume a
 * `NetworkAdapter`. Ship your own adapter (WebSocket relay, native WebRTC,
 * Cloudflare Worker, …) by implementing these three interfaces.
 *
 * Adapters move opaque strings; framing/serialization is the session layer's
 * concern.
 */

export type Unsubscribe = () => void;

/** A single reliable, ordered, bidirectional message channel. */
export interface NetworkConnection {
  send(data: string): void;
  /** Subscribe to incoming messages. Returns an unsubscribe function. */
  onMessage(callback: (data: string) => void): Unsubscribe;
  /** Subscribe to the connection closing (either side, or transport failure). */
  onClose(callback: () => void): Unsubscribe;
  close(): void;
}

/** The host's listening endpoint for a room. */
export interface HostTransport {
  /** Fires once per controller that connects. */
  onConnection(callback: (connection: NetworkConnection) => void): Unsubscribe;
  /** Stop listening and close every open connection. */
  close(): void;
}

export interface NetworkAdapter {
  /**
   * Start hosting a room. Must reject with `RoomUnavailableError` if the
   * room id is already taken (the session layer will retry with a new code).
   */
  host(roomId: string): Promise<HostTransport>;
  /**
   * Connect to a hosted room. Must reject with `RoomNotFoundError` if no
   * host exists for the room id.
   */
  join(roomId: string): Promise<NetworkConnection>;
}
