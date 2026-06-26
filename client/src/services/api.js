const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  auth: {
    login: (username, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
    signup: (username, password) => request("/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),
  },
  servers: {
    list: () => request("/servers"),
    get: (id) => request(`/servers/${id}`),
    create: (name, icon) => request("/servers", { method: "POST", body: JSON.stringify({ name, icon }) }),
  },
  channels: {
    create: (serverId, name) => request("/channels", { method: "POST", body: JSON.stringify({ serverId, name }) }),
  },
  messages: {
    list: (chatKey) => request(`/messages/${chatKey}`),
    send: (chatKey, sender, content, isImage, replyTo) =>
      request("/messages", {
        method: "POST",
        body: JSON.stringify({ chatKey, sender, content, isImage, replyTo }),
      }),
  },
  friends: {
    list: () => request("/friends"),
    add: (username) => request("/friends", { method: "POST", body: JSON.stringify({ username }) }),
    remove: (id) => request(`/friends/${id}`, { method: "DELETE" }),
    update: (id, data) => request(`/friends/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },
};
