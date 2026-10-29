import "../../tests-utils/dynamodb.mock";
import { mockSend } from "../../tests-utils/dynamodb.mock";
import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import * as dal from "../product-service-dal";
import { makeEvent } from "../../tests-utils/events";

const TENANT = "t-aaaa1111";
const item = {
  shardId: `${TENANT}-1`,
  productId: "abc",
  sku: "123",
  name: "Test",
  price: 5,
  category: { id: "cat1", name: "Category" },
};

describe("product_service_dal", () => {
  beforeEach(() => {
    mockSend.mockReset();
    jest.clearAllMocks();
  });

  it("getProduct: should return product if found", async () => {
    mockSend.mockResolvedValueOnce({ Item: item });

    const product = await dal.getProduct(makeEvent(), `${TENANT}-1:abc`);
    expect(product?.sku).toBe("123");
    expect(product?.key).toBe(`${TENANT}-1:abc`);
  });

  it("getProduct: should return null if not found", async () => {
    mockSend.mockResolvedValueOnce({});
    const product = await dal.getProduct(makeEvent(), `${TENANT}-1:abc`);
    expect(product).toBeNull();
  });

  it("getAllProducts: queries all 10 shards of the caller's tenant", async () => {
    mockSend.mockResolvedValue({ Items: [] });
    mockSend.mockResolvedValueOnce({ Items: [item] });

    const result = await dal.getAllProducts(makeEvent());
    expect(result).toHaveLength(1);

    const shards = (QueryCommand as unknown as jest.Mock).mock.calls.map(
      ([input]) => input.ExpressionAttributeValues[":v"],
    );
    expect(shards).toHaveLength(10);
    expect(shards.every((s: string) => s.startsWith(`${TENANT}-`))).toBe(true);
  });

  it("uses the pooled table for pooled tenants", async () => {
    mockSend.mockResolvedValueOnce({});
    await dal.getProduct(makeEvent(), `${TENANT}-1:abc`);
    expect((GetCommand as unknown as jest.Mock).mock.calls[0][0].TableName).toBe(
      process.env.PRODUCT_TABLE_NAME,
    );
  });

  it("uses Product-<tenantId> for dedicated tenants", async () => {
    mockSend.mockResolvedValueOnce({});
    await dal.getProduct(makeEvent({ dedicatedTenancy: "true" }), `${TENANT}-1:abc`);
    expect((GetCommand as unknown as jest.Mock).mock.calls[0][0].TableName).toBe(
      `Product-${TENANT}`,
    );
  });

  it("fails closed without tenant-scoped credentials", async () => {
    await expect(
      dal.getProduct(makeEvent({ withCredentials: false }), `${TENANT}-1:abc`),
    ).rejects.toThrow("Missing tenant-scoped credentials");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("deleteProduct: should return deleted product data", async () => {
    mockSend.mockResolvedValueOnce({ Attributes: item });
    const result = await dal.deleteProduct(makeEvent(), `${TENANT}-1:abc`);
    expect(result?.sku).toBe("123");
  });

  it("deleteProduct: should return null if no item found", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await dal.deleteProduct(makeEvent(), `${TENANT}-1:abc`);
    expect(result).toBeNull();
  });

  it("updateProduct: should return updated product", async () => {
    const payload = {
      sku: "NEW",
      name: "Updated",
      price: 10,
      category: { id: "cat2", name: "UpdatedCat" },
    };
    mockSend.mockResolvedValueOnce({ Attributes: { ...item, ...payload } });

    const result = await dal.updateProduct(makeEvent(), payload as any, `${TENANT}-1:abc`);
    expect(result?.sku).toBe("NEW");
    expect((UpdateCommand as unknown as jest.Mock).mock.calls[0][0].ConditionExpression).toBe(
      "attribute_exists(#pk_exists)",
    );
  });

  it("updateProduct: returns null instead of creating an unknown item", async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error("failed"), { name: "ConditionalCheckFailedException" }),
    );
    const result = await dal.updateProduct(makeEvent(), { name: "X" }, `${TENANT}-1:nope`);
    expect(result).toBeNull();
  });

  it("createProduct: puts the product in one of the tenant's shards", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await dal.createProduct(makeEvent(), {
      sku: "SKU1",
      name: "Apple",
      price: 5,
      category: { id: "cat1", name: "Fruit" },
    });
    expect(result.sku).toBe("SKU1");
    expect(result.key.startsWith(`${TENANT}-`)).toBe(true);
  });
});
