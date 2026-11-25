export type UserRole = "admin" | "member";

export interface AuthContext {
  userId: string;
  organizationId: string;
  role: UserRole;
}