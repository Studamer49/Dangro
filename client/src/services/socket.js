import { io } from "socket.io-client";
import { getAccessToken } from "./api";

const API_URL = import.meta.env.VITE_API_URL || "";
const SOCKET_URL = API_URL ? API_URL.replace(/\/api\/?$/, "") : "/";

const socket = io(SOCKET_URL, {
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
