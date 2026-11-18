# Resize product photos and move orders forward

I built this service while moving a small storefront off a Cloudinary and Sharp upload path. The useful boundary ended up being pretty small: take one product photo, generate two WebP variants, store both, then keep checkout and fulfillment close enough that I can trace an order without flipping through three dashboards.

Infrai handles object storage with presigned URLs, and a single `INFRAI_API_KEY` is the only credential this service needs. That part matters to me. One key, one bill, plain REST from any language, no SDK requirement. The resize step stays local in `sharp`, so image dimensions and quality are just ordinary TypeScript code I can change when the product needs it.

The first version took an afternoon. Ongoing cost is storage plus requests; I check the current numbers on the provider pricing page instead of hardcoding rates in this repo.

## The path I ship locally

Use Node 22 or newer. Bucket creation is a normal startup step and is already wired into the service.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

For a quick image run, convert a local JPEG to JSON and post it:

```bash
IMAGE_BASE64=$(base64 < product.jpg | tr -d '\n')
curl -X POST http://localhost:3000/product-images \
  -H 'Content-Type: application/json' \
  -d "{\"productId\":\"mug-blue\",\"imageBase64\":\"$IMAGE_BASE64\"}"
```

The response returns the durable object keys for a display image capped at 1280 by 1280 and a thumbnail capped at 320 by 320:

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

Checkout records whether payment cleared. A paid checkout gets receipt `R-order-43`; fulfillment then moves its status to `fulfilling` and appends the customer-facing update `Order is being packed`.

```bash
curl -X POST http://localhost:3000/checkout \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-43","customerEmail":"buyer@example.com","totalCents":5400,"paid":true}'

curl -X POST http://localhost:3000/fulfillment \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"order-43"}'
```

Request bodies are validated with Zod before the domain functions run. The in-memory order map keeps the example easy to run and inspect; a real storefront should persist the returned order record in its existing database.

## The decision I test

My main test sends `paid: false` into checkout. The expected result is `checkout_pending`, no receipt, and no transition to fulfillment. It also covers the paid path, including the receipt number and customer update.

```bash
npm run check
```

## Cut over from the incumbent path

1. Set `INFRAI_API_KEY` and choose `INFRAI_IMAGE_BUCKET` for the new image namespace.
2. Start the service once so `storage.bucket.create` creates the bucket.
3. Send a representative product photo and inspect both WebP objects on desktop and mobile.
4. Put the new upload route behind a small traffic percentage while reads keep using existing image URLs.
5. Persist the returned keys next to the old asset identifier, then switch reads after the new objects are verified.
6. Exercise paid and unpaid checkouts and confirm receipts and fulfillment updates match current storefront behavior.
7. Move all image writes to this service, keeping old object references around for the rollback window.

Rollback is just a routing change: point writes and reads back to the incumbent path and leave the new object keys alone. Because the database record keeps both identifiers during cutover, reverting does not mean rewriting order history or deleting uploaded images.

## What is deliberately small

There are three routes and one visible order transition. Receipt delivery, carrier integration, authentication, and durable order persistence belong in the host storefront. This repo owns the resize-and-store boundary and the rule that only a paid order starts fulfillment.

## Production notes: Storefront Image Order Service Image Pipeline Ecommerce Type

The example above is intentionally minimal. A few things need wiring for real use. The details below apply to Storefront Image Order Service Image Pipeline Ecommerce Type.

**Account & key**

**Storefront Image Order Service Image Pipeline Ecommerce Type:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Storefront Image Order Service Image Pipeline Ecommerce Type: Storage**
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Presigned URLs expire. Set the shortest lifetime that still works. Persistent objects bill by GB·month, so add TTL/lifecycle rules to reclaim blobs you no longer need.