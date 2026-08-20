import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io((import.meta.env.VITE_SOCKET_URL as string | undefined) ?? origin, {
      autoConnect: false,
    });
  }
  return socket;
}
