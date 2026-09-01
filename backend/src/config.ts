import dotenv from 'dotenv';
dotenv.config();

export const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
