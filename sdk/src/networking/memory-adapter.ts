import { RoomNotFoundError, RoomUnavailableError } from "../errors";
import type { HostTransport, NetworkAdapter, NetworkConnection, Unsubscribe } from "./adapter";

/**
 * In-memory adapter. Host and controllers must live in the same JS context
 * (same page / same test). Used for unit tests and same-screen demos.
 *
 * Delivery is async (microtask) to mimic real transports and avoid
 * reentrancy surprises.
 */

const rooms = new Map<string, MemoryRoom>();

/** Test helper: tear down every room. */
export function resetMemoryAdapter(): void {
  for (const room of [...rooms.values()]) room.close();
  rooms.clear();
}

class MemoryConnection implements NetworkConnection {
  peer!: MemoryConnection;
  private messageHandlers = new Set<(data: string) => void>();
  private closeHandlers = new Set<() => void>();
  private pending: string[] = [];
  private closed = false;

  send(data: string): void {
    if (this.closed) return;
    const peer = this.peer;
    queueMicrotask(() => peer.deliver(data));
  }

  private deliver(data: string): void {
    if (this.closed) return;
    if (this.messageHandlers.size === 0) {
      this.pending.push(data);
      return;
    }
    for (const handler of [...this.messageHandlers]) handler(data);
  }

  onMessage(callback: (data: string) => void): Unsubscribe {
    this.messageHandlers.add(callback);
    if (this.pending.length > 0) {
      const buffered = this.pending.splice(0);
      queueMicrotask(() => {
        for (const data of buffered) {
          if (!this.closed) callback(data);
        }
      });
    }
    return () => this.messageHandlers.delete(callback);
  }

  onClose(callback: () => void): Unsubscribe {
    this.closeHandlers.add(callback);
    return () => this.closeHandlers.delete(callback);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    queueMicrotask(() => {
      for (const handler of [...this.closeHandlers]) handler();
      this.peer.close();
    });
  }
}

class MemoryRoom implements HostTransport {
  private connectionHandlers = new Set<(connection: NetworkConnection) => void>();
  private connections = new Set<MemoryConnection>();

  constructor(private readonly roomId: string) {}

  onConnection(callback: (connection: NetworkConnection) => void): Unsubscribe {
    this.connectionHandlers.add(callback);
    return () => this.connectionHandlers.delete(callback);
  }

  accept(hostEnd: MemoryConnection): void {
    this.connections.add(hostEnd);
    queueMicrotask(() => {
      for (const handler of [...this.connectionHandlers]) handler(hostEnd);
    });
  }

  close(): void {
    rooms.delete(this.roomId);
    for (const connection of [...this.connections]) connection.close();
    this.connections.clear();
    this.connectionHandlers.clear();
  }
}

export class MemoryAdapter implements NetworkAdapter {
  async host(roomId: string): Promise<HostTransport> {
    if (rooms.has(roomId)) throw new RoomUnavailableError(roomId);
    const room = new MemoryRoom(roomId);
    rooms.set(roomId, room);
    return room;
  }

  async join(roomId: string): Promise<NetworkConnection> {
    const room = rooms.get(roomId);
    if (!room) throw new RoomNotFoundError(roomId);
    const controllerEnd = new MemoryConnection();
    const hostEnd = new MemoryConnection();
    controllerEnd.peer = hostEnd;
    hostEnd.peer = controllerEnd;
    room.accept(hostEnd);
    return controllerEnd;
  }
}
