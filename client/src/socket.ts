import { io, type Socket } from "socket.io-client";
import type { ClientToServer, ServerToClient } from "../../shared/types";
import { loadAccount, serverUrl } from "./account";

export const socket: Socket<ServerToClient, ClientToServer> = io(serverUrl, {
  auth: { token: loadAccount()?.token },
});

/** Reconnect so the server sees the new (or removed) login */
export function setSocketToken(token?: string) {
  socket.auth = { token };
  socket.disconnect().connect();
}
