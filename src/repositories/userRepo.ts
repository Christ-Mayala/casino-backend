import { UserModel, type User } from '../models/User';

export const userRepo = {
  findByEmail: (email: string) => UserModel.findOne({ email }).exec(),
  create: (data: Partial<User>) => UserModel.create(data),
  findById: (id: string) => UserModel.findById(id).exec(),
};
