import { io } from "socket.io-client";
import { getAccessToken } from "./api";

const socket = io("/", {
  autoConnect: false,
  auth: { token: getAccessToken() },
});

export function reconnectSocket() {
  socket.auth = { token: getAccessToken() };
  if (socket.connected) {
    socket.disconnect().connect();
  }
}

export default socket;
