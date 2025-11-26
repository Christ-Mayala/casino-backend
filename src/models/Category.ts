import { Schema, model, type InferSchemaType } from 'mongoose';

const categorySchema = new Schema(
  {
    name: { type: String, unique: true, required: true, index: true },
    slug: { type: String, unique: true, required: true, index: true },
    imageUrl: { type: String, required: true },
    description: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type Category = InferSchemaType<typeof categorySchema> & { _id: any };
export const CategoryModel = model('Category', categorySchema);
