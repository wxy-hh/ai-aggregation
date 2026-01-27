export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserUsage {
  userId: string;
  tokens: number;
  tasks: number;
  period: string;
}
