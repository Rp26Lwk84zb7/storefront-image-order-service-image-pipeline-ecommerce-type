export type OrderStatus = "checkout_pending" | "paid" | "fulfilling" | "shipped";

export type Order = {
  id: string;
  customerEmail: string;
  totalCents: number;
  status: OrderStatus;
  receipt: { number: string; issuedAt: string } | null;
  updates: Array<{ status: OrderStatus; message: string }>;
};

export function checkoutOrder(input: {
  orderId: string;
  customerEmail: string;
  totalCents: number;
  paid: boolean;
  now: string;
}): Order {
  const status: OrderStatus = input.paid ? "paid" : "checkout_pending";
  return {
    id: input.orderId,
    customerEmail: input.customerEmail,
    totalCents: input.totalCents,
    status,
    receipt: input.paid ? { number: `R-${input.orderId}`, issuedAt: input.now } : null,
    updates: [{ status, message: input.paid ? "Payment received" : "Payment pending" }],
  };
}

export function beginFulfillment(order: Order): Order {
  if (order.status !== "paid") return order;
  return {
    ...order,
    status: "fulfilling",
    updates: [...order.updates, { status: "fulfilling", message: "Order is being packed" }],
  };
}
