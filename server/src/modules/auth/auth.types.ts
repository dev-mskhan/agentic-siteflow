export interface RegisterInput {
  organizationName: string;
  organizationSlug: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}
