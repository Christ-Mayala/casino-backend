import { ProductModel } from '../models/Product';

export const productRepo = {
  list: (filter: any = {}, page = 1, limit = 20) =>
    ProductModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).exec(),
  count: (filter: any = {}) => ProductModel.countDocuments(filter).exec(),
  get: (id: string) => ProductModel.findById(id).exec(),
  getBySKU: (sku: string) => ProductModel.findOne({ sku }).exec(),
  create: (data: any) => ProductModel.create(data),
  update: (id: string, data: any) => ProductModel.findByIdAndUpdate(id, data, { new: true }).exec(),
  remove: (id: string) => ProductModel.findByIdAndDelete(id).exec(),
};
