import { invoke } from "@tauri-apps/api/core";
import type { SecretStore } from "@tuner/core";

/** SecretStore on the OS keychain, through the Rust commands in src-tauri/src/secrets.rs (D5). */
export const keychain: SecretStore = {
  get: (key) => invoke<string | null>("secret_get", { key }),
  set: (key, value) => invoke("secret_set", { key, value }),
  delete: (key) => invoke("secret_delete", { key }),
};
