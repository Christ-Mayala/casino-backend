import { CategoryModel } from '../models/Category';

export const categoryRepo = {
  list: (filter: any = {}, page = 1, limit = 20) =>
    CategoryModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).exec(),
  count: (filter: any = {}) => CategoryModel.countDocuments(filter).exec(),
  get: (id: string) => CategoryModel.findById(id).exec(),
  create: (data: any) => CategoryModel.create(data),
  update: (id: string, data: any) => CategoryModel.findByIdAndUpdate(id, data, { new: true }).exec(),
  remove: (id: string) => CategoryModel.findByIdAndDelete(id).exec(),
  findBySlug: (slug: string) => CategoryModel.findOne({ slug }).exec(),
};
