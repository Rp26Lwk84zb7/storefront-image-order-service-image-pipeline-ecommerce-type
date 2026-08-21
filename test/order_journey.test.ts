import { describe, expect, it } from "vitest";
import { beginFulfillment, checkoutOrder } from "../src/order_journey.js";

describe("checkout to fulfillment", () => {
  it("keeps an unpaid order out of fulfillment and creates no receipt", () => {
    const order = checkoutOrder({
      orderId: "order-42",
      customerEmail: "buyer@example.com",
      totalCents: 5400,
      paid: false,
      now: "2026-08-21T09:00:00.000Z",
    });

    expect(beginFulfillment(order)).toEqual(order);
    expect(order.receipt).toBeNull();
    expect(order.updates.at(-1)?.message).toBe("Payment pending");
  });

  it("issues a receipt and records the customer update for a paid order", () => {
    const paid = checkoutOrder({
      orderId: "order-43",
      customerEmail: "buyer@example.com",
      totalCents: 5400,
      paid: true,
      now: "2026-08-21T09:00:00.000Z",
    });
    const fulfilling = beginFulfillment(paid);

    expect(fulfilling.status).toBe("fulfilling");
    expect(fulfilling.receipt?.number).toBe("R-order-43");
    expect(fulfilling.updates.at(-1)?.message).toBe("Order is being packed");
  });
});
