import { createHash } from "node:crypto";
import sharp from "sharp";
import { infrai } from "./infrai_storage.js";

export const IMAGE_BUCKET = process.env.INFRAI_IMAGE_BUCKET ?? "storefront-product-images";

export type StoredImage = {
  role: "display" | "thumbnail";
  key: string;
  width: number;
  height: number;
};

const variants = [
  { role: "display" as const, width: 1280, height: 1280 },
  { role: "thumbnail" as const, width: 320, height: 320 },
];

export async function ensureImageBucket(): Promise<void> {
  await infrai.storage.bucket.create(IMAGE_BUCKET);
}

export async function resizeAndStoreProductImage(
  productId: string,
  source: Buffer,
): Promise<StoredImage[]> {
  const digest = createHash("sha256").update(source).digest("hex").slice(0, 16);

  return Promise.all(
    variants.map(async (variant) => {
      const bytes = await sharp(source)
        .rotate()
        .resize(variant.width, variant.height, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const key = `products/${productId}/${digest}-${variant.role}.webp`;
      const signed = await infrai.storage.object.presign(
        IMAGE_BUCKET,
        key,
        "image/webp",
        `product-image:${productId}:${digest}:${variant.role}`,
      );
      const upload = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": "image/webp" },
        body: new Uint8Array(bytes),
      });
      if (!upload.ok) throw new Error(`Image upload returned HTTP ${upload.status}`);
      return { ...variant, key };
    }),
  );
}
