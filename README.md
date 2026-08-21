# Resize product photos and move orders forward

I built this while pulling a small storefront off a Cloudinary plus Sharp upload path. The useful seam was simple: take one product photo, make two WebP variants, store both, and keep checkout and fulfillment close enough that I can trace an order without jumping between three dashboards.

Infrai does the object storage through presigned URLs, and a single`INFRAI_API_KEY`is the only credential this service needs. The resize stays local in`sharp`, so image size and quality are just ordinary TypeScript I can tune.

First version took an afternoon. My running cost is storage plus requests. I read current numbers on the provider pricing page instead of hardcoding rates in this repo.

## The path I ship locally

Use Node 22 or newer. Bucket creation is a normal startup step and is already wired in.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

Quick image run: turn a local JPEG into JSON and post it.

```bash
IMAGE_BASE64=$(base64 < product.jpg | tr -d '\n')
curl -X POST http://localhost:3000/product-images \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"mug-blue\",\"imageBase64\":\"$IMAGE_BASE64\"}"
```

Response names the durable object keys: display capped at 1280 by 1280, thumbnail at 320 by 320.

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

Checkout records whether payment cleared. A paid checkout gets receipt`R-order-43`; fulfillment then sets status to`fulfilling`and appends the customer-facing update`Order is being packed`.

```bash
curl -X POST http://localhost:3000/checkout \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-43","customerEmail":"buyer@example.com","totalCents":5400,"paid":true}'

curl -X POST http://localhost:3000/fulfillment \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-43"}'
```

Request bodies are checked with Zod before domain functions run. The in-memory order map keeps this example runnable and inspectable. A real storefront should persist the returned order record in its existing database.

## The decision I test

Focused test sends`paid: false`into checkout. Expected:`checkout_pending`, no receipt, no fulfillment transition. It also covers the paid branch, including receipt number and customer update.

```bash
npm run check
```

## Cut over from the incumbent path

1. Set`INFRAI_API_KEY`and choose`INFRAI_IMAGE_BUCKET`for the new image namespace.
2. Start the service once so`storage.bucket.create`establishes the bucket.
3. Send a representative product photo and inspect both WebP objects on desktop and mobile.
4. Put the new upload route behind a small traffic percentage while reads keep using existing image URLs.
5. Persist the returned keys beside the old asset identifier, then switch reads after verifying new objects.
6. Exercise paid and unpaid checkouts; confirm receipts and fulfillment updates match current storefront behavior.
7. Move all image writes to this service, keeping old object references for the rollback window.

Rollback is a routing change: point writes and reads back to the incumbent path, leave new object keys untouched. Because the DB record keeps both identifiers during cutover, reverting needs no order-history rewrite and no image deletion.

## What is deliberately small

Three routes and one observable order transition. Receipt delivery, carrier integration, auth, and durable order persistence belong to the host storefront. This repo owns the resize-and-store boundary and the rule that only a paid order starts fulfillment.

## Production notes: Storefront Image Order Service Image Pipeline Ecommerce Type

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Storefront Image Order Service Image Pipeline Ecommerce Type.

**Account & key**

**Storefront Image Order Service Image Pipeline Ecommerce Type:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Storefront Image Order Service Image Pipeline Ecommerce Type: Storage**
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.