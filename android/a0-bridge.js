/* a0 Android bridge — typed, allowlisted, schema-checked.
 *
 * Loaded into the built GUI via a script tag (no React rebuild).
 * Exposes window.a0 with:
 *   - capabilities: camera | location | files | notifications | sensors
 *   - termux.runCommand(templateId, args)   (allowlisted templates only)
 *   - config: secure a0 endpoint + token (SharedPreferences-backed)
 *   - schema: JSON request/result schemas + permission allowlists
 *
 * No capability path accepts a raw command string. Termux commands are
 * selected by template id; the model may fill typed args only.
 */
(function () {
  "use strict";

  const bridge = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.A0Bridge;
  const READY = bridge ? Promise.resolve() : new Promise((resolve) => {
    document.addEventListener("DOMContentLoaded", resolve);
  });

  // --- structured request/result schemas -----------------------------------
  const schemas = {
    camera_getPhoto: {
      request: { type: "object", properties: { maxDimension: { type: "number", maximum: 4096 } } },
      result: {
        type: "object", required: ["ok", "name", "uri", "size"],
        properties: { ok: { type: "boolean" }, name: { type: "string" }, uri: { type: "string" }, size: { type: "number" }, mime: { type: "string" }, error: { type: "string" } },
      },
    },
    location_get: {
      request: { type: "object", properties: { timeoutMs: { type: "number", maximum: 30000 } } },
      result: {
        type: "object", required: ["ok"],
        properties: { ok: { type: "boolean" }, lat: { type: "number" }, lng: { type: "number" }, provider: { type: "string" }, accuracy: { type: "number" }, ts: { type: "number" }, error: { type: "string" } },
      },
    },
    files_list: {
      request: { type: "object", required: ["root"], properties: { root: { enum: ["app", "documents"] }, path: { type: "string" } } },
      result: {
        type: "object", required: ["ok", "entries"],
        properties: { ok: { type: "boolean" }, entries: { type: "array", items: { type: "object", properties: { name: { type: "string" }, path: { type: "string" }, dir: { type: "boolean" }, size: { type: "number" } } } }, error: { type: "string" } },
      },
    },
    files_read: {
      request: { type: "object", required: ["root", "path"], properties: { root: { enum: ["app", "documents"] }, path: { type: "string" }, maxBytes: { type: "number", maximum: 1048576 } } },
      result: {
        type: "object", required: ["ok"],
        properties: { ok: { type: "boolean" }, content: { type: "string" }, size: { type: "number" }, mime: { type: "string" }, error: { type: "string" } },
      },
    },
    files_write: {
      request: { type: "object", required: ["root", "path", "content"], properties: { root: { enum: ["app", "documents"] }, path: { type: "string" }, content: { type: "string" }, append: { type: "boolean" } } },
      result: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, path: { type: "string" }, size: { type: "number" }, error: { type: "string" } } },
    },
    notifications_notify: {
      request: { type: "object", required: ["title", "text"], properties: { title: { type: "string" }, text: { type: "string" }, id: { type: "number" } } },
      result: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, id: { type: "number" }, error: { type: "string" } } },
    },
    sensors_read: {
      request: { type: "object", properties: { sensor: { enum: ["accelerometer", "light"] } } },
      result: {
        type: "object", required: ["ok"],
        properties: { ok: { type: "boolean" }, sensor: { type: "string" }, values: { type: "object" }, ts: { type: "number" }, error: { type: "string" } },
      },
    },
    termux_run: {
      request: { type: "object", required: ["templateId"], properties: { templateId: { type: "string" }, args: { type: "object" } } },
      result: {
        type: "object", required: ["ok", "execId"],
        properties: { ok: { type: "boolean" }, execId: { type: "string" }, stdout: { type: "string" }, stderr: { type: "string" }, exitCode: { type: "number" }, pending: { type: "boolean" }, error: { type: "string" } },
      },
    },
    config_set: {
      request: { type: "object", required: ["endpoint", "token"], properties: { endpoint: { type: "string", pattern: "^https://" }, token: { type: "string" } } },
      result: { type: "object", required: ["ok"], properties: { ok: { type: "boolean" }, endpoint: { type: "string" }, error: { type: "string" } } },
    },
  };

  // --- capability / permission allowlists -----------------------------------
  const permissionAllowlist = {
    camera: ["CAMERA"],
    location: ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
    files: ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"], // app root is always allowed
    notifications: ["POST_NOTIFICATIONS"],
    sensors: [], // accelerometer/light need no runtime permission
    termux: [],
  };

  const capabilityAllowlist = Object.freeze(["camera", "location", "files", "notifications", "sensors", "termux"]);

  // Termux command templates. Only these exist; no free-form command strings.
  const termuxTemplates = Object.freeze({
    "sys.pwd": { cmd: ["pwd"], args: {} },
    "sys.whoami": { cmd: ["whoami"], args: {} },
    "sys.df": { cmd: ["df", "-h"], args: {} },
    "sys.uname": { cmd: ["uname", "-a"], args: {} },
    "git.status": { cmd: ["git", "status", "--short"], args: { path: { type: "string", pattern: "^[A-Za-z0-9_./-]{0,120}$" } }, cwd: true },
    "git.log": { cmd: ["git", "log", "--oneline", "-n"], args: { n: { type: "number", maximum: 20 }, path: { type: "string", pattern: "^[A-Za-z0-9_./-]{0,120}$" } }, cwd: true },
    "py.version": { cmd: ["python3", "--version"], args: {} },
    "ssh.status": { cmd: ["ssh", "-T", "git@github.com"], args: {} },
  });

  function checkSchema(schema, value, label) {
    // Minimal, honest structural checker for the shapes above.
    if (!schema || typeof schema !== "object") return null;
    if (schema.required && Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (value == null || !(key in value)) return `${label}: missing required field '${key}'`;
      }
    }
    if (schema.properties && value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        const prop = schema.properties[key];
        if (!prop) return `${label}: unexpected field '${key}'`;
        if (prop.type === "string" && typeof value[key] !== "string") return `${label}: '${key}' must be a string`;
        if (prop.type === "number" && typeof value[key] !== "number") return `${label}: '${key}' must be a number`;
        if (prop.type === "boolean" && typeof value[key] !== "boolean") return `${label}: '${key}' must be a boolean`;
        if (prop.enum && !prop.enum.includes(value[key])) return `${label}: '${key}' must be one of ${prop.enum.join(", ")}`;
        if (prop.pattern && typeof value[key] === "string" && !new RegExp(prop.pattern).test(value[key])) return `${label}: '${key}' violates pattern`;
        if (prop.maximum && typeof value[key] === "number" && value[key] > prop.maximum) return `${label}: '${key}' exceeds maximum`;
      }
    }
    return null;
  }

  async function native(method, payload) {
    await READY;
    if (!bridge) throw new Error("native bridge unavailable (not running inside the a0 Android shell)");
    const result = await bridge[method](payload || {});
    return result || {};
  }

  const capabilities = {
    camera: {
      async getPhoto(args = {}) {
        const err = checkSchema(schemas.camera_getPhoto.request, args, "camera.getPhoto.request");
        if (err) throw new Error(err);
        const result = await native("getPhoto", args);
        const rerr = checkSchema(schemas.camera_getPhoto.result, result, "camera.getPhoto.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
    },
    location: {
      async get(args = {}) {
        const err = checkSchema(schemas.location_get.request, args, "location.get.request");
        if (err) throw new Error(err);
        const result = await native("getLocation", args);
        const rerr = checkSchema(schemas.location_get.result, result, "location.get.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
    },
    files: {
      async list(args) {
        const err = checkSchema(schemas.files_list.request, args, "files.list.request");
        if (err) throw new Error(err);
        const result = await native("listFiles", args);
        const rerr = checkSchema(schemas.files_list.result, result, "files.list.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
      async read(args) {
        const err = checkSchema(schemas.files_read.request, args, "files.read.request");
        if (err) throw new Error(err);
        const result = await native("readFile", args);
        const rerr = checkSchema(schemas.files_read.result, result, "files.read.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
      async write(args) {
        const err = checkSchema(schemas.files_write.request, args, "files.write.request");
        if (err) throw new Error(err);
        const result = await native("writeFile", args);
        const rerr = checkSchema(schemas.files_write.result, result, "files.write.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
    },
    notifications: {
      async notify(args) {
        const err = checkSchema(schemas.notifications_notify.request, args, "notifications.notify.request");
        if (err) throw new Error(err);
        const result = await native("notify", args);
        const rerr = checkSchema(schemas.notifications_notify.result, result, "notifications.notify.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
    },
    sensors: {
      async read(args = {}) {
        const err = checkSchema(schemas.sensors_read.request, args, "sensors.read.request");
        if (err) throw new Error(err);
        const result = await native("readSensor", args);
        const rerr = checkSchema(schemas.sensors_read.result, result, "sensors.read.result");
        if (rerr) throw new Error(rerr);
        return result;
      },
    },
  };

  const termux = {
    async runCommand(templateId, args = {}) {
      const err = checkSchema(schemas.termux_run.request, { templateId, args }, "termux.runCommand.request");
      if (err) throw new Error(err);
      const template = termuxTemplates[templateId];
      if (!template) throw new Error(`termux command template '${templateId}' is not allowlisted`);
      for (const key of Object.keys(args)) {
        const spec = template.args[key];
        if (!spec) throw new Error(`termux template '${templateId}' does not accept arg '${key}'`);
        if (spec.type === "string" && spec.pattern && !new RegExp(spec.pattern).test(String(args[key]))) {
          throw new Error(`termux arg '${key}' violates pattern`);
        }
        if (spec.type === "number" && (typeof args[key] !== "number" || args[key] > spec.maximum)) {
          throw new Error(`termux arg '${key}' out of range`);
        }
      }
      const result = await native("termuxRun", { templateId, args });
      const rerr = checkSchema(schemas.termux_run.result, result, "termux.runCommand.result");
      if (rerr) throw new Error(rerr);
      return result;
    },
  };

  const config = {
    async get() {
      return native("getConfig", {});
    },
    async set({ endpoint, token }) {
      const err = checkSchema(schemas.config_set.request, { endpoint, token }, "config.set.request");
      if (err) throw new Error(err);
      return native("setConfig", { endpoint, token });
    },
  };

  // --- a0 endpoint bootstrap ------------------------------------------------
  // Patches window.fetch so /api/* calls hit the configured secure endpoint
  // with the stored bearer token. Absolute URLs and non-/api paths pass
  // through untouched.
  async function bootstrapEndpoint() {
    try {
      const cfg = await config.get();
      if (!cfg || !cfg.endpoint) return;
      const base = cfg.endpoint.replace(/\/+$/, "");
      const token = cfg.token || "";
      const originalFetch = window.fetch.bind(window);
      window.fetch = function (input, init) {
        let url = input;
        let opts = init || {};
        if (typeof url === "string" && url.startsWith("/api/")) {
          url = base + url;
          if (token) {
            const headers = new Headers(opts.headers || {});
            if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + token);
            opts = Object.assign({}, opts, { headers });
          }
        } else if (url instanceof Request && url.url && url.url.startsWith("http")) {
          // pass through
        }
        return originalFetch(url, opts);
      };
      window.a0Endpoint = base;
    } catch (_e) {
      /* no native bridge (plain browser) — GUI keeps its own origin */
    }
  }

  window.a0 = {
    bridgeReady: READY,
    capabilities,
    termux,
    config,
    schema: schemas,
    permissionAllowlist,
    capabilityAllowlist,
    termuxTemplates,
  };

  bootstrapEndpoint();
})();
