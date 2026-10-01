import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests run against the local anvil config so they never need testnet
    // addresses or an API token.
    env: { ENVIO_CONFIG: "config.local.yaml" },
  },
});
