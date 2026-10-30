// Configurable MCP host: connection auth, discovery, enable/disable, and
// actual invocation through the shared coordinator. Local shell execution is
// intentionally absent; only remote MCP servers with validated endpoints run.
import net from 'node:net';
import dns from 'node:dns/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BLOCKED_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal']);
const BLOCKED_CIDRS = ['127.0.0.0/8', '::1/128', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16', 'fe80::/10', 'fc00::/7'];

function ipInCidr(ip, cidr) {
  try {
    const isV6 = ip.includes(':');
    const [range, bitsStr] = cidr.split('/');
    const bits = Number(bitsStr);
    if (isV6 !== range.includes(':')) return false;
    if (isV6) {
      const addr = ipToBigInt(ip);
      const base = ipToBigInt(range);
      const mask = (BigInt(1) << BigInt(128 - bits)) - BigInt(1);
      return (addr & ~mask) === (base & ~mask);
    }
    const addr = ipv4ToInt(ip);
    const base = ipv4ToInt(range);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return ((addr & mask) >>> 0) === ((base & mask) >>> 0);
  } catch {
    return false;
  }
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function ipToBigInt(ip) {
  const parts = ip.split(':');
  let out = BigInt(0);
  for (const part of parts) {
    out = (out << BigInt(16)) + BigInt(part === '' ? 0 : Number.parseInt(part, 16));
  }
  return out;
}

export async function validateMcpUrl(rawUrl, { allowPrivateNetwork = false } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    const err = new Error('Invalid MCP server URL.');
    err.status = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    const err = new Error('MCP server URL must be http(s).');
    err.status = 400;
    throw err;
  }
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host)) {
    const err = new Error('MCP server URL points to a blocked cloud-metadata endpoint.');
    err.status = 400;
    throw err;
  }
  let addresses = [];
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    addresses = (await dns.lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  }
  for (const addr of addresses) {
    if (BLOCKED_HOSTS.has(addr)) {
      const err = new Error('MCP server URL resolves to a blocked cloud-metadata address.');
      err.status = 400;
      throw err;
    }
    if (allowPrivateNetwork) continue;
    if (BLOCKED_CIDRS.some((cidr) => ipInCidr(addr, cidr))) {
      const err = new Error('MCP server URL resolves to a private/loopback address. Enable "Allow private network" only for explicitly authorized private servers.');
      err.status = 400;
      throw err;
    }
  }
  return url;
}

export async function discoverTools({ url, authHeader }) {
  const client = new Client({ name: 'a0', version: '1.0.0' });
  const headers = {};
  if (authHeader) headers.Authorization = authHeader;
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    }));
  } finally {
    await client.close().catch(() => {});
  }
}

export async function invokeMcpTool({ url, authHeader, toolName, args, signal }) {
  const client = new Client({ name: 'a0', version: '1.0.0' });
  const headers = {};
  if (authHeader) headers.Authorization = authHeader;
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers } });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name: toolName, arguments: args }, undefined, { signal });
    let text = '';
    for (const item of result.content || []) {
      if (item.type === 'text') text += item.text;
    }
    return { isError: Boolean(result.isError), text: text.slice(0, 50000), raw: result };
  } finally {
    await client.close().catch(() => {});
  }
}

// Coordinate selected tool proposals. Deduplicates identical effects and
// records conflicts explicitly instead of blindly dispatching duplicates.
export function coordinateToolSelections(proposals, selection) {
  const selectedIds = new Set(selection.actionIds || []);
  const chosen = proposals.filter((p) => selectedIds.has(p.id));
  const groups = new Map();
  for (const action of chosen) {
    const key = `${action.connectionId}::${action.toolName}::${JSON.stringify(action.arguments)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(action);
  }
  const dispatch = [];
  for (const [key, actions] of groups) {
    const representative = actions[0];
    dispatch.push({
      actionIds: actions.map((a) => a.id),
      requesters: actions.map((a) => a.requesterParticipantId),
      connectionId: representative.connectionId,
      toolName: representative.toolName,
      arguments: representative.arguments,
      duplicateOf: actions.length > 1 ? actions[1].id : null,
      conflicting: actions.length > 1,
    });
  }
  // Conflicts: same tool name but different arguments across chosen actions.
  const byTool = new Map();
  for (const d of dispatch) {
    if (!byTool.has(d.toolName)) byTool.set(d.toolName, []);
    byTool.get(d.toolName).push(d);
  }
  for (const [toolName, items] of byTool) {
    if (items.length > 1) {
      for (const item of items) item.conflicting = true;
    }
  }
  return dispatch;
}
