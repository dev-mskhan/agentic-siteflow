import jwt from "jsonwebtoken";
import { env } from "../../config/index.js";
import { UnauthorizedError } from "../../common/index.js";

export interface JwtPayload {
  sub: string; // userId
  orgId: string; // organizationId
  email: string;
}

export interface JwtHelper {
  sign(payload: JwtPayload): string;
  verify(token: string): JwtPayload;
}

export function createJwtHelper(): JwtHelper {
  return {
    sign(payload: JwtPayload): string {
      return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
      });
    },
    verify(token: string): JwtPayload {
      try {
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        return decoded;
      } catch {
        throw new UnauthorizedError("Invalid or expired token");
      }
    },
  };
}

// Singleton — import this everywhere
export const jwtHelper = createJwtHelper();
