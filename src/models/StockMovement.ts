import { Schema, model, Types, type InferSchemaType } from 'mongoose';

const stockMovementSchema = new Schema(
  {
    productId: { type: Types.ObjectId, ref: 'Product', required: true, index: true },
    type: { type: String, enum: ['in', 'out', 'adjust'], required: true },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    createdBy: { type: Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type StockMovement = InferSchemaType<typeof stockMovementSchema> & { _id: any };
export const StockMovementModel = model('StockMovement', stockMovementSchema);
