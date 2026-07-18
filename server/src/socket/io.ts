import { Server as SocketServer } from "socket.io";

let io: SocketServer | null = null;

export function setIO(socketIO: SocketServer): void {
  io = socketIO;
}

export function getIO(): SocketServer | null {
  return io;
}
