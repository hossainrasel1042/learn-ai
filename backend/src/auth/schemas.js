

import { z } from 'zod';






export const SignUpRequest = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
});


export const SignInRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});


export const ForgotPasswordRequest = z.object({
  email: z.string().email(),
});


export const ResendOtpRequest = z.object({
  email: z.string().email(),
});


export const VerifyOtpRequest = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});


export const ResetPasswordRequest = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
});


export const ChangePasswordRequest = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});


export const VerifyEmailRequest = z.object({
  token: z.string().min(1).max(200),
});





export const MeResultSchema = z.object({
  id: z.string(),
  email: z.string(),
  profile: z.object({
    id: z.string(),
    name: z.string(),
    avatarUrl: z.string().nullable(),
    role: z.string(),
  }),
});

export const SignInResultSchema = z.object({
  success: z.literal(true),
});





export class MeResult {
  constructor({ id, email, profile } = {}) {
    this.id = id;
    this.email = email;
    this.profile = profile;
  }

  toDict() {
    return {
      id: this.id,
      email: this.email,
      profile: this.profile
        ? {
            id: this.profile.id,
            name: this.profile.name,
            avatarUrl: this.profile.avatarUrl ?? null,
            role: this.profile.role || 'user',
          }
        : null,
    };
  }
}

export class SignInResult {
  constructor({ success = true } = {}) {
    this.success = success;
  }

  toDict() {
    return { success: this.success };
  }
}
