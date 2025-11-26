import 'dotenv/config';
import bcrypt from 'bcryptjs';

async function run() {
  let mem: any = null;
  try {
    if (!process.env.MONGO_URI) {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mem = await MongoMemoryServer.create();
      process.env.MONGO_URI = mem.getUri();
      console.log(`[seed] Using in-memory MongoDB at ${process.env.MONGO_URI}`);
    }

    const { connectMongo } = await import('./config/mongo');
    const { initializeCloudinaryService } = await import('./services/cloudinary');
    const { v2: cloudinary } = await import('cloudinary');
    const { UserModel } = await import('./models/User');
    const { CategoryModel } = await import('./models/Category');
    const { ProductModel } = await import('./models/Product');
    const { getCollections } = await import('./legacy/db');

    await connectMongo();

    // Initialiser Cloudinary si les identifiants sont fournis
    const cloudOk = initializeCloudinaryService();

    async function uploadImagesToCloudinary(urls: string[], folder: string, publicPrefix: string): Promise<string[]> {
      if (!cloudOk) {
        console.warn('[seed] Cloudinary non configuré — utilisation des URLs directes');
        return urls;
      }
      const out: string[] = [];
      for (let i = 0; i < urls.length; i++) {
        const src = urls[i];
        const public_id = `${publicPrefix}_${i+1}`;
        try {
          console.log(`[seed] Upload Cloudinary => ${public_id}`);
          const res = await cloudinary.uploader.upload(src, {
            folder,
            public_id,
            overwrite: false,
            resource_type: 'image',
          } as any);
          out.push(res.secure_url);
        } catch (e) {
          console.error(`[seed] Échec upload Cloudinary pour ${src}:`, e);
          out.push(src);
        }
      }
      return out;
    }

    const adminEmail = 'admin@example.com';
    const passwordHash = await bcrypt.hash('admin123', 10);
    await UserModel.deleteMany({ email: adminEmail });
    // Admin user for API access
    await UserModel.create({ email: adminEmail, passwordHash, role: 'admin', status: 'active' });

    // Seed staff users (preparateur & caissier) for dashboard login
    const preparateurEmail = 'preparateur@example.com';
    const caissierEmail = 'caissier@example.com';
    const prepHash = await bcrypt.hash('prep12345', 10);
    const caisHash = await bcrypt.hash('caisse123', 10);
    await UserModel.deleteMany({ email: { $in: [preparateurEmail, caissierEmail] } });
    await UserModel.create([
      { email: preparateurEmail, passwordHash: prepHash, role: 'preparateur', status: 'active' },
      { email: caissierEmail, passwordHash: caisHash, role: 'caissier', status: 'active' },
    ]);

    // Seed categories (with imageUrl) for client UI
    await CategoryModel.deleteMany({});
    const categories = await CategoryModel.insertMany([
      { name: 'Fruits & Légumes', slug: 'fruits-legumes', imageUrl: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713', description: 'Produits frais et locaux' },
      { name: 'Boissons', slug: 'boissons', imageUrl: 'https://images.unsplash.com/photo-1510627498534-cf7e9002facc', description: 'Sodas, jus et eaux' },
      { name: 'Épicerie', slug: 'epicerie', imageUrl: 'https://images.unsplash.com/photo-1505577058444-a3dab90d4253', description: 'Produits secs et conserves' },
    ]);

    // Seed products with multiple images for product cards and detail gallery
    await ProductModel.deleteMany({});
    const catMap = new Map(categories.map(c => [c.slug, c]));
    const sampleImages = (q: string) => [
      `https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=800&q=80`,
      `https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80`,
      `https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=800&q=80`,
    ];

    // Construire les produits puis uploader les images vers Cloudinary (si configuré)
    const defs = [
      { name: 'Pommes Golden', sku: 'FRU-APPLE-GOLDEN', price: 1500, slug: 'fruits-legumes', stockQuantity: 120, imgs: sampleImages('apple') },
      { name: 'Bananes Cavendish', sku: 'FRU-BANANA-CAV', price: 1200, slug: 'fruits-legumes', stockQuantity: 85, imgs: sampleImages('banana') },
      { name: "Jus d'orange 1L", sku: 'DRK-ORANGE-JUICE', price: 1800, slug: 'boissons', stockQuantity: 60, imgs: sampleImages('orange-juice') },
      { name: 'Eau minérale 1.5L (pack de 6)', sku: 'DRK-WATER-6', price: 2000, slug: 'boissons', stockQuantity: 200, imgs: sampleImages('water') },
      { name: 'Pâtes Penne 500g', sku: 'GRC-PENNE-500', price: 900, slug: 'epicerie', stockQuantity: 300, imgs: sampleImages('pasta') },
    ];

    const docs = [] as any[];
    for (const d of defs) {
      const folder = 'products';
      const images = await uploadImagesToCloudinary(d.imgs, folder, d.sku.toLowerCase());
      const categoryId = catMap.get(d.slug)!._id;
      docs.push({ name: d.name, sku: d.sku, price: d.price, categoryId, stockQuantity: d.stockQuantity, images, status: 'active' });
    }
    await ProductModel.insertMany(docs);

    // Legacy collections for staff and pickup slots
    const { pickupSlots } = await getCollections();
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    await pickupSlots.deleteMany({ date: dateStr });
    await pickupSlots.insertOne({ date: dateStr, timeFrom: '09:00', timeTo: '11:00', capacity: 50, remaining: 50, isActive: true });

    console.log('Seed completed. Admin: admin@example.com / admin123');
  } finally {
    if (mem) {
      await mem.stop();
      console.log('[seed] In-memory MongoDB stopped');
    }
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
