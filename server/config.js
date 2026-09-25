import dotenv from 'dotenv';

// .env is the source of truth for this app's configuration. By default dotenv skips
// keys that already exist in the environment, so a stale inherited JWT_SECRET (from
// PM2's saved env or a shell that sourced an older .env) silently outweighs the file —
// including after a secret rotation. Override so what is in the file is what runs.
dotenv.config({ override: true });

export const config = {
  port: Number(process.env.PORT ?? 3001),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  db: {
    host: process.env.DB_HOST ?? '10.28.9.109',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? 'P@ssw0rd!1',
    name: process.env.DB_NAME ?? 'e-journey',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-this-secret-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  },
};

export function userSchemaName(userId) {
  return `ej_user_${userId}`;
}