import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "org.interdependentway.a0",
  appName: "a0",
  webDir: "dist/public",
  android: {
    allowMixedContent: false,
  },
  plugins: {
    A0Bridge: {},
  },
};

export default config;
