import "../../tests-utils/dynamodb.mock";
import { mockSend } from "../../tests-utils/dynamodb.mock";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import * as dal from "../order-service-dal";
import { OrderProduct } from "../order-model";
import { makeEvent } from "../../tests-utils/events";

const TENANT = "t-aaaa1111";
const item = {
  shardId: `${TENANT}-1`,
  orderId: "abc",
  orderName: "Test Order",
  orderProducts: [
    { productId: "1", price: 4, quantity: 2 },
    { productId: "4", price: 5, quantity: 3 },
  ],
};

describe("order_service_dal", () => {
  beforeEach(() => {
    mockSend.mockReset();
    jest.clearAllMocks();
  });

  it("getOrder: should return order if found", async () => {
    mockSend.mockResolvedValueOnce({ Item: item });

    const order = await dal.getOrder(makeEvent(), `${TENANT}-1:abc`);
    expect(order?.key).toBe(`${TENANT}-1:abc`);
    expect(order?.orderName).toBe("Test Order");
    expect(order?.orderProducts).toHaveLength(2);
  });

  it("getOrder: should return null if not found", async () => {
    mockSend.mockResolvedValueOnce({});
    const order = await dal.getOrder(makeEvent(), `${TENANT}-1:abc`);
    expect(order).toBeNull();
  });

  it("getAllOrders: should return orders from all shards", async () => {
    mockSend.mockResolvedValue({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [item] });

    const result = await dal.getAllOrders(makeEvent());
    expect(result).toHaveLength(1);
    expect(mockSend).toHaveBeenCalledTimes(10);
  });

  it("uses Order-<tenantId> for dedicated tenants", async () => {
    mockSend.mockResolvedValueOnce({});
    await dal.getOrder(makeEvent({ dedicatedTenancy: "true" }), `${TENANT}-1:abc`);
    expect((GetCommand as unknown as jest.Mock).mock.calls[0][0].TableName).toBe(
      `Order-${TENANT}`,
    );
  });

  it("deleteOrder: should return deleted order data", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: { ...item, orderName: "Old Order" },
    });

    const result = await dal.deleteOrder(makeEvent(), `${TENANT}-1:abc`);
    expect(result?.orderName).toBe("Old Order");
  });

  it("deleteOrder: should return null if no item found", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await dal.deleteOrder(makeEvent(), `${TENANT}-1:abc`);
    expect(result).toBeNull();
  });

  it("updateOrder: should return updated order", async () => {
    const payload = {
      orderName: "Updated Order",
      orderProducts: [
        new OrderProduct("3", 15, 1),
        new OrderProduct("4", 20, 2),
      ],
    };
    mockSend.mockResolvedValueOnce({ Attributes: { ...item, ...payload } });

    const result = await dal.updateOrder(makeEvent(), payload, `${TENANT}-1:abc`);
    expect(result?.orderName).toBe("Updated Order");
    expect(result?.orderProducts).toHaveLength(2);
  });

  it("createOrder: puts the order in one of the tenant's shards", async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await dal.createOrder(makeEvent(), {
      orderName: "Test Order",
      orderProducts: [new OrderProduct("1", 5, 2)],
    });
    expect(result.orderName).toBe("Test Order");
    expect(result.key.startsWith(`${TENANT}-`)).toBe(true);
  });
});
