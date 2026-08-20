"use strict";

const { safeStorage } = require("electron");
const Store = require("electron-store");

const TOKEN_KEY = "accessToken";

class AuthTokenStore {
  constructor() {
    this.store = new Store({ name: "auth-session" });
  }

  get() {
    const encrypted = this.store.get(TOKEN_KEY);
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return null;

    try {
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      this.clear();
      return null;
    }
  }

  set(token) {
    if (!token || !safeStorage.isEncryptionAvailable()) return false;
    const encrypted = safeStorage.encryptString(token).toString("base64");
    this.store.set(TOKEN_KEY, encrypted);
    return true;
  }

  clear() {
    this.store.delete(TOKEN_KEY);
  }
}

module.exports = { AuthTokenStore };
