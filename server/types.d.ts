declare global {
  namespace Express {
    interface User {
      claims?: {
        sub?: string;
        email?: string;
        first_name?: string;
        last_name?: string;
        name?: string;
        profile_image_url?: string;
      };
      access_token?: string;
      refresh_token?: string;
      expires_at?: number;
    }
  }
}

export {};
