import { Peer } from "peerjs";
import type { DataConnection } from "peerjs";
import { ConnectionTimeoutError, RoomNotFoundError, RoomUnavailableError } from "../errors";
import type { HostTransport, NetworkAdapter, NetworkConnection, Unsubscribe } from "./adapter";

/**
 * Default adapter: WebRTC data channels brokered by the free public PeerJS
 * cloud. Zero servers to run — the room code doubles as the host's peer id.
 */

// Namespaces our peer ids on the shared public broker and versions the wire
// protocol: v2 hosts won't collide with v1 controllers.
const ID_PREFIX = "opencontrol-v1-";
const JOIN_TIMEOUT_MS = 15_000;

function roomToPeerId(roomId: string): string {
  return ID_PREFIX + roomId.toLowerCase();
}

type PeerOptions = NonNullable<ConstructorParameters<typeof Peer>[1]>;

class PeerConnection implements NetworkConnection {
  constructor(private readonly conn: DataConnection) {}

  send(data: string): void {
    this.conn.send(data);
  }

  onMessage(callback: (data: string) => void): Unsubscribe {
    const handler = (data: unknown) => callback(String(data));
    this.conn.on("data", handler);
    return () => this.conn.off("data", handler);
  }

  onClose(callback: () => void): Unsubscribe {
    this.conn.on("close", callback);
    return () => this.conn.off("close", callback);
  }

  close(): void {
    this.conn.close();
  }
}

export interface PeerJSAdapterOptions {
  /** Raw options forwarded to the `Peer` constructor (custom server, ICE config, …). */
  peerOptions?: PeerOptions;
}

export class PeerJSAdapter implements NetworkAdapter {
  constructor(private readonly options: PeerJSAdapterOptions = {}) {}

  host(roomId: string): Promise<HostTransport> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(roomToPeerId(roomId), this.options.peerOptions);
      let settled = false;

      peer.on("open", () => {
        if (settled) return;
        settled = true;
        const handlers = new Set<(connection: NetworkConnection) => void>();

        peer.on("connection", (conn: DataConnection) => {
          conn.on("open", () => {
            const wrapped = new PeerConnection(conn);
            for (const handler of [...handlers]) handler(wrapped);
          });
        });

        resolve({
          onConnection(callback) {
            handlers.add(callback);
            return () => handlers.delete(callback);
          },
          close() {
            peer.destroy();
          },
        });
      });

      peer.on("error", (error: Error & { type?: string }) => {
        if (settled) return; // post-open errors surface as per-connection closes
        settled = true;
        peer.destroy();
        reject(error.type === "unavailable-id" ? new RoomUnavailableError(roomId) : error);
      });
    });
  }

  join(roomId: string): Promise<NetworkConnection> {
    return new Promise((resolve, reject) => {
      const peer = this.options.peerOptions ? new Peer(this.options.peerOptions) : new Peer();
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        peer.destroy();
        reject(new ConnectionTimeoutError(`Could not reach room "${roomId}" in time`));
      }, JOIN_TIMEOUT_MS);

      peer.on("open", () => {
        const conn = peer.connect(roomToPeerId(roomId), { reliable: true });
        conn.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          // The whole client peer exists for this one connection.
          conn.on("close", () => peer.destroy());
          resolve(new PeerConnection(conn));
        });
      });

      peer.on("error", (error: Error & { type?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        peer.destroy();
        reject(error.type === "peer-unavailable" ? new RoomNotFoundError(roomId) : error);
      });
    });
  }
}
