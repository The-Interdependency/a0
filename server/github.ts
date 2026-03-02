import { Octokit } from '@octokit/rest'

let connectionSettings: any;
let usePublicFallback = false;

async function getAccessToken(): Promise<string | null> {
  if (process.env.GITHUB_PAT) {
    return process.env.GITHUB_PAT;
  }

  if (
    connectionSettings &&
    connectionSettings.settings?.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    return null;
  }

  try {
    const res = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
      {
        headers: {
          'Accept': 'application/json',
          'X-Replit-Token': xReplitToken
        }
      }
    );
    const data = await res.json();
    connectionSettings = data.items?.[0];

    if (!connectionSettings) {
      return null;
    }

    const accessToken =
      connectionSettings.settings?.access_token ||
      connectionSettings.settings?.oauth?.credentials?.access_token;

    return accessToken || null;
  } catch {
    return null;
  }
}

export async function getUncachableGitHubClient(): Promise<Octokit> {
  const accessToken = await getAccessToken();
  if (accessToken) {
    usePublicFallback = false;
    return new Octokit({ auth: accessToken });
  }
  usePublicFallback = true;
  return new Octokit();
}

export function isPublicFallbackMode(): boolean {
  return usePublicFallback;
}
