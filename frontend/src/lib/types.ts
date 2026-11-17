
export type User = {
  id: string;
  email: string;
  profile: {
    id: string;
    name: string;
    avatarUrl: string | null;
    role: 'user' | 'admin';
    friendCode: string | null;
  };
};