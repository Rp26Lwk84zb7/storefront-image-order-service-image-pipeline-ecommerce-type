import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError } from "./infrai_storage.js";
import { ensureImageBucket, resizeAndStoreProductImage } from "./product_image_pipeline.js";
import { beginFulfillment, checkoutOrder, type Order } from "./order_journey.js";

const uploadBody = z.object({
  productId: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  imageBase64: z.string().min(1),
});
const checkoutBody = z.object({
  orderId: z.string().min(1),
  customerEmail: z.string().email(),
  totalCents: z.number().int().positive(),
  paid: z.boolean(),
});
const fulfillBody = z.object({ orderId: z.string().min(1) });
const orders = new Map<string, Order>();

async function jsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method === "POST" && request.url === "/product-images") {
    const input = uploadBody.parse(await jsonBody(request));
    const images = await resizeAndStoreProductImage(input.productId, Buffer.from(input.imageBase64, "base64"));
    send(response, 201, { productId: input.productId, images });
    return;
  }
  if (request.method === "POST" && request.url === "/checkout") {
    const input = checkoutBody.parse(await jsonBody(request));
    const order = checkoutOrder({
      orderId: input.orderId,
      customerEmail: input.customerEmail,
      totalCents: input.totalCents,
      paid: input.paid,
      now: new Date().toISOString(),
    });
    orders.set(order.id, order);
    send(response, 201, order);
    return;
  }
  if (request.method === "POST" && request.url === "/fulfillment") {
    const input = fulfillBody.parse(await jsonBody(request));
    const current = orders.get(input.orderId);
    if (!current) return send(response, 404, { error: "Order not found" });
    const order = beginFulfillment(current);
    orders.set(order.id, order);
    send(response, 200, order);
    return;
  }
  send(response, 404, { error: "Route not found" });
}

export function startStorefrontService(port = Number(process.env.PORT ?? 3000)): void {
  const server = createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      if (error instanceof z.ZodError) return send(response, 400, { error: "Invalid request", issues: error.issues });
      if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        return send(response, status, { error: error.message, code: error.detail.code });
      }
      send(response, 500, { error: error instanceof Error ? error.message : "Unexpected error" });
    });
  });
  server.listen(port, () => console.log(`Storefront service listening on http://localhost:${port}`));
}

await ensureImageBucket();
startStorefrontService();
