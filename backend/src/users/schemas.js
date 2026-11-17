

import { z } from 'zod';


export const UpdateProfileRequest = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarUrl: z
    .string()
    .max(2048)
    .refine(
      (v) => {
        let parsed;
        try {
          parsed = new URL(v);
        } catch (_) {
          return false;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return false;
        }

        return /\/avatars\/[^/]+\/[^/]+$/.test(parsed.pathname);
      },
      { message: 'avatarUrl must be an http(s) URL pointing at an uploaded avatar' },
    )
    .nullable()
    .optional(),
});


export const DeleteProfileRequest = z.object({
  password: z.string().min(1),
});