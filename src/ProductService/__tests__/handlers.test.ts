import { mockSend } from "../../tests-utils/dynamodb.mock";
import { makeEvent } from "../../tests-utils/events";
import {
  createProductHandler,
  getProductHandler,
  updateProductHandler,
  validateProduct,
} from "../handlers";
import { validateOrder } from "../../OrderService/handlers";

const product = { sku: "S1", name: "Apple", price: 5, category: { id: "c1", name: "Fruit" } };

describe("product handlers", () => {
  beforeEach(() => mockSend.mockReset());

  it("returns 400 for a malformed JSON body", async () => {
    const res = await createProductHandler(makeEvent({ body: "{not json" }));
    expect(res.statusCode).toBe(400);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid product", async () => {
    const res = await createProductHandler(makeEvent({ body: { ...product, price: -1 } }));
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 for a malformed item key", async () => {
    const res = await getProductHandler(makeEvent({ pathParameters: { id: "no-colon" } }));
    expect(res.statusCode).toBe(400);
  });

  it("answers 404 when the session policy blocks another tenant's key", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("not authorized"), { name: "AccessDeniedException" }),
    );
    const res = await getProductHandler(
      makeEvent({ pathParameters: { id: "t-bbbb2222-1:abc" } }),
    );
    expect(res.statusCode).toBe(404);
  });

  it("returns 500 without internal error details", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockSend.mockRejectedValueOnce(new Error("Requested resource not found: Table ProductTable"));
    const res = await updateProductHandler(
      makeEvent({ pathParameters: { id: "t-aaaa1111-1:abc" }, body: { name: "B" } }),
    );
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("ProductTable");
  });
});

describe("validation", () => {
  it("validateProduct accepts a full product and partial updates", () => {
    expect(validateProduct(product)).toBeNull();
    expect(validateProduct({ name: "New name" }, true)).toBeNull();
    expect(validateProduct({ name: "" }, true)).not.toBeNull();
    expect(validateProduct({ sku: "S1" })).not.toBeNull();
  });

  it("validateOrder checks every order product", () => {
    const order = { orderName: "O1", orderProducts: [{ productId: "p1", price: 2, quantity: 1 }] };
    expect(validateOrder(order)).toBeNull();
    expect(validateOrder({ ...order, orderProducts: [] })).not.toBeNull();
    expect(
      validateOrder({ ...order, orderProducts: [{ productId: "p1", price: 2, quantity: 0.5 }] }),
    ).not.toBeNull();
  });
});
