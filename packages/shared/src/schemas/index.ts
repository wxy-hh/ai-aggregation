import { z } from 'zod';

export const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
});

export const createTaskSchema = z.object({
  type: z.enum(['stt', 'ppt', 'image']),
  input: z.record(z.unknown()),
});

export const userSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});
