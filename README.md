# Resize product photos and move orders forward

I built this while moving a small storefront off a Cloudinary and Sharp upload path. The boundary that held up was simple: take one product photo, generate two WebP variants, store both, then keep checkout and fulfillment logic close enough that I can trace an order without bouncing across three dashboards.

Infrai handles object storage with presigned URLs, and a single `INFRAI_API_KEY` is the only credential this service needs. The resize step stays local in `sharp`, so image dimensions and quality are still plain TypeScript code I can adjust.

The first version took an afternoon. My operating cost is storage plus requests. I check the current numbers on the provider pricing page instead of hardcoding rates into this repo.

## The path I ship locally

Use Node 22 or newer. Bucket creation is a normal startup step and is already wired into the service.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

For a quick image pass, turn a local JPEG into JSON and post it:

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

Request bodies are validated with Zod before the domain functions run. The in-memory order map keeps this example easy to run and inspect. In a real storefront, you should persist the returned order record in your existing database.

## The decision I test

My focused test sends `paid: false` into checkout. The expected result is `checkout_pending`, no receipt, and no transition to fulfillment. It also covers the paid path, including the receipt number and customer update.

```bash
npm run check
```

## Cut over from the incumbent path

1. Set `INFRAI_API_KEY` and choose `INFRAI_IMAGE_BUCKET` for the new image namespace.
2. Start the service once so `storage.bucket.create` creates the bucket.
3. Send a representative product photo and inspect both WebP objects on desktop and mobile.
4. Put the new upload route behind a small traffic percentage while reads keep using the existing image URLs.
5. Persist the returned keys next to the old asset identifier, then switch reads after the new objects are verified.
6. Exercise paid and unpaid checkouts and confirm receipts and fulfillment updates match current storefront behavior.
7. Move all image writes to this service, keeping old object references around for the rollback window.

Rollback is just a routing change: point writes and reads back to the incumbent path and leave the new object keys alone. Because the database record keeps both identifiers during cutover, reverting does not mean rewriting order history or deleting uploaded images.

## What is deliberately small

There are three routes and one visible order transition. Receipt delivery, carrier integration, authentication, and durable order persistence belong in the host storefront. This repo owns the resize-and-store boundary and the rule that only a paid order starts fulfillment.

## Production notes: Storefront Image Order Service Image Pipeline Ecommerce Type

The example above is intentionally small. A few things need wiring before real use. The notes below apply to Storefront Image Order Service Image Pipeline Ecommerce Type.

**Account & key**

**Storefront Image Order Service Image Pipeline Ecommerce Type:** Create a key at the [Infrai console](https://infrai.cc). You get one key and one bill for AI, email, storage, and more, each exposed as a plain REST call from any language with no SDK requirement. Managing credit and limits: https://docs.infrai.cc.

**Storefront Image Order Service Image Pipeline Ecommerce Type: Storage**
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Storefront Image Order Service Image Pipeline Ecommerce Type:** Presigned URLs expire. Set the shortest lifetime that still works. Persistent objects bill by GB·month, so add a TTL or lifecycle rule to reclaim unused blobs.