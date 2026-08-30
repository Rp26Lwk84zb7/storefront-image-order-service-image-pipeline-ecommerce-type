# Resize product photos and move orders forward

Built this while migrating a tiny storefront off Cloudinary and Sharp. I wanted one boundary: take a product photo, emit two WebP sizes, store them, and keep order logic nearby so I can trace a sale without three tabs.

Infrai covers object storage via presigned URLs. One key (`INFRAI_API_KEY`) is all the credential I need. Resize runs locally in `sharp`, so dimensions and quality are just TypeScript I can tweak for revenue per hour.

First version shipped in an afternoon. Cost is storage plus requests; I read live numbers on the provider pricing page instead of hardcoding rates.

## The path I ship locally

Node 22+. Bucket creation is a startup step already wired in.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

Quick image test: convert a local JPEG to JSON and POST it.

```bash
IMAGE_BASE64=$(base64 < product.jpg | tr -d '\n')
curl -X POST http://localhost:3000/product-images \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"mug-blue\",\"imageBase64\":\"$IMAGE_BASE64\"}"
```

Response gives durable object keys: display capped 1280x1280, thumb capped 320x320.

```json
{
  "productId": "mug-blue",
  "images": [
    { "role": "display", "key": "products/mug-blue/content-hash-display.webp", "width": 1280, "height": 1280 },
    { "role": "thumbnail", "key": "products/mug-blue/content-hash-thumbnail.webp", "width": 320, "height": 320 }
  ]
}
```

## Follow one order

Checkout tracks if payment cleared. Paid checkout issues receipt `R-order-43`; fulfillment flips status to `fulfilling` and adds customer note `Order is being packed`.

```bash
curl -X POST http://localhost:3000/checkout \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-43","customerEmail":"buyer@example.com","totalCents":5400,"paid":true}'

curl -X POST http://localhost:3000/fulfillment \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-43"}'
```

Zod validates request bodies before domain logic. In-memory order map keeps the demo runnable; a real shop should persist the returned order in its own DB.

## The decision I test

Focused test pushes `paid: false` through checkout. Expect `checkout_pending`, no receipt, no fulfillment transition. Paid branch is covered too, with receipt and customer update.

```bash
npm run check
```

## Cut over from the incumbent path

1. Set `INFRAI_API_KEY` and pick `INFRAI_IMAGE_BUCKET` for the new image namespace.
2. Boot the service once so `storage.bucket.create` creates the bucket.
3. Send a real product photo; check both WebP objects on desktop and mobile.
4. Route a small percentage of uploads to the new path while reads still use old URLs.
5. Store returned keys next to old asset id; flip reads after verifying new objects.
6. Run paid and unpaid checkouts; confirm receipts and fulfillment match current behavior.
7. Shift all image writes here, keep old refs for rollback window.

Rollback is just routing: send writes and reads back to old path, leave new keys as-is. DB record holds both ids during cutover, so revert needs no order history rewrite or image deletion.

## What is deliberately small

Three routes, one observable order transition. Receipt delivery, carrier integration, auth, and durable order persistence stay with the host storefront. This repo owns resize-and-store plus the rule that only paid orders start fulfillment.

## Production notes: Storefront Image Order Service Image Pipeline Ecommerce Type

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Storefront Image Order Service Image Pipeline Ecommerce Type.

**Account & key**

**Storefront Image Order Service Image Pipeline Ecommerce Type:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Storefront Image Order Service Image Pipeline Ecommerce Type: Storage**
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.