

import { z } from 'zod';






export const UploadAvatarResponse = z.object({
  path: z.string(),
  url: z.string(),
});






export const DeleteAvatarRequest = z.object({
  avatarUrl: z.string(),
});
