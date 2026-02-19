import 'dotenv/config';
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in .env file');
}

console.log("process.env.DATABASE_URL:", process.env.DATABASE_URL);

export default defineConfig({
  schema: "./src/db/schema.js",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  }
});