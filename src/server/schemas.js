// src/server/schemas.js
import { z } from "zod";

export const TONE_VALUES = ["professional", "friendly", "formal", "persuasive", "casual", "concise", "confident"];

export const campaignConfigSchema = z.object({
  dailyTarget: z.number().int().min(1).max(100),
  categories: z.array(z.string().trim().min(1).max(60)).max(10),
  countries: z.array(z.string().trim().min(1).max(60)).max(20),
  industries: z.array(z.string().trim().min(1).max(60)).max(20),
  tone: z.enum(TONE_VALUES),
  requireApproval: z.boolean(),
  attachCv: z.boolean(),
  allowUnverified: z.boolean(),
  followUpDays: z.number().int().min(2).max(30),
  maxFollowUps: z.number().int().min(0).max(2),
});
