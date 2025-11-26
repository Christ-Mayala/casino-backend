import { Schema, model, Types, type InferSchemaType } from 'mongoose';

const productSchema = new Schema(
  {
    name: { type: String, required: true },
    sku: { type: String, required: true, unique: true, index: true },
    price: { type: Number, required: true, min: 0 },
    categoryId: { type: Types.ObjectId, ref: 'Category', required: true, index: true },
    stockQuantity: { type: Number, default: 0, min: 0 },
    images: [{ type: String }],
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type Product = InferSchemaType<typeof productSchema> & { _id: any };
export const ProductModel = model('Product', productSchema);
