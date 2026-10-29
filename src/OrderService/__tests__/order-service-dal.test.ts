import "../__mocks__/dynamodb.mock";
import { mockSend } from "../__mocks__/dynamodb.mock";
import * as dal from "../order-service-dal";
import { Order, OrderProduct } from "../order-model";

describe("order_service_dal", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("getOrder: should return order if found", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        shardId: "1",
        orderId: "abc",
        orderName: "Test Order",
        orderProducts: [
          { productId: "1", price: 4, quantity: 2 },
          { productId: "4", price: 5, quantity: 3 },
        ],
      },
    });

    const order = await dal.getOrder(null, "1:abc");
    expect(order).toBeDefined();
    expect(order?.key).toBe("1:abc");
    expect(order?.orderName).toBe("Test Order");
    expect(order?.orderProducts).toHaveLength(2);
  });

  it("getOrder: should return null if not found", async () => {
    mockSend.mockResolvedValueOnce({});
    const order = await dal.getOrder(null, "1:abc");
    expect(order).toBeNull();
  });

  // it("getAllOrders: should return list of orders", async () => {
  //   mockSend.mockResolvedValueOnce({
  //     Items: [
  //       {
  //         shardId: "1",
  //         orderId: "abc",
  //         orderName: "Test Order",
  //         orderProducts: [{ productId: "1", price: 5, quantity: 2 }],
  //       },
  //     ],
  //   });

  //   const result = await dal.getAllOrders(makeEvent("1"));
  //   expect(result).toHaveLength(1);
  //   expect(result[0].key).toBe("1:abc");
  // });

  it("deleteOrder: should return deleted order data", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        shardId: "1",
        orderId: "abc",
        orderName: "Old Order",
        orderProducts: [{ productId: "1", price: 10, quantity: 2 }],
      },
    });

    const result = await dal.deleteOrder(null, "1:abc");
    expect(result).toBeDefined();
    expect(result?.orderName).toBe("Old Order");
  });

  it("deleteOrder: should return null if no item found", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await dal.deleteOrder(null, "1:abc");
    expect(result).toBeNull();
  });

  it("updateOrder: should return updated order", async () => {
    const payload = {
      orderName: "Updated Order",
      orderProducts: [
        { productId: "3", price: 15, quantity: 1 },
        { productId: "4", price: 20, quantity: 2 },
      ],
    };

    mockSend.mockResolvedValueOnce({
      Attributes: {
        shardId: "1",
        orderId: "abc",
        ...payload,
      },
    });

    const result = await dal.updateOrder(null, payload, "1:abc");
    expect(result).toBeDefined();
    expect(result?.orderName).toBe("Updated Order");
    expect(result?.orderProducts).toHaveLength(2);
  });

  it("createOrder: should return created order", async () => {
    mockSend.mockResolvedValueOnce({});

    const order = new Order("1", "test-id", "Test Order", [
      new OrderProduct("1", 5, 2),
    ]);

    const result = await dal.createOrder(null, order);
    expect(result).toBeDefined();
    expect(result?.orderName).toBe("Test Order");
    expect(result?.orderProducts[0].productId).toBe("1");
  });
});
