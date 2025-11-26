import { StockMovementModel } from '../models/StockMovement';

export const stockRepo = {
  create: (data: any) => StockMovementModel.create(data),
  list: (filter: any = {}, page = 1, limit = 20) =>
    StockMovementModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).exec(),
  count: (filter: any = {}) => StockMovementModel.countDocuments(filter).exec(),
};
