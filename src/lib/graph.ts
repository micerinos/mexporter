import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { TenantConfig } from "./types";

class TokenManager {
  private config: TenantConfig;
  private accessToken: string | null = null;
  private expirationTime: number = 0;

  constructor(config: TenantConfig) {
    this.config = config;
  }

  async getAccessToken(): Promise<string> {
    // Buffer of 2 minutes
    if (this.accessToken && Date.now() < this.expirationTime - 120000) {
      return this.accessToken;
    }

    const { tenantId, clientId, clientSecret } = this.config;

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error(`Missing configuration for tenant: ${this.config.name}`);
    }

    console.log(`Refreshing access token for tenant: ${tenantId}`);

    const tokenResponse = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to fetch token: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error(`Failed to get access token for ${this.config.name}: ${JSON.stringify(tokenData)}`);
    }

    this.accessToken = tokenData.access_token;
    // expires_in is in seconds
    this.expirationTime = Date.now() + (tokenData.expires_in * 1000);

    return this.accessToken || "";
  }
}

export async function getGraphClientForTenant(config: TenantConfig) {
  const tokenManager = new TokenManager(config);

  // Validate credentials immediately by fetching the first token
  await tokenManager.getAccessToken();

  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await tokenManager.getAccessToken();
        done(null, token);
      } catch (error: any) {
        done(error, null);
      }
    },
  });
}
