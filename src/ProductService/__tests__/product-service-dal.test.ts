import "../__mocks__/dynamodb.mock";
import { mockSend } from "../__mocks__/dynamodb.mock";
import * as dal from "../product-service-dal";
import { Category, Product } from "../product-model";

describe("product_service_dal", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it("getProduct: should return product if found", async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        shardId: "1",
        productId: "abc",
        sku: "123",
        name: "Test",
        price: 5,
        category: { id: "cat1", name: "Category" },
      },
    });

    const product = await dal.getProduct(null, "1:abc");
    expect(product).toBeDefined();
    expect(product?.sku).toBe("123");
  });

  it("getProduct: should return null if not found", async () => {
    mockSend.mockResolvedValueOnce({});
    const product = await dal.getProduct(null, "1:abc");
    expect(product).toBeNull();
  });

  // it("getAllProducts: should return list of products", async () => {
  //   mockSend.mockResolvedValueOnce({
  //     Items: [
  //       {
  //         shardId: "1",
  //         productId: "abc",
  //         sku: "123",
  //         name: "Test",
  //         price: 5,
  //         category: { id: "cat1", name: "Category" },
  //       },
  //     ],
  //   });

  //   const result = await dal.getAllProducts(makeEvent("1"));
  //   expect(result).toHaveLength(1);
  //   expect(result[0].sku).toBe("123");
  // });

  it("deleteProduct: should return deleted product data", async () => {
    mockSend.mockResolvedValueOnce({
      Attributes: {
        shardId: "1",
        productId: "abc",
        sku: "123",
        name: "Test",
        price: 5,
        category: { id: "cat1", name: "Category" },
      },
    });

    const result = await dal.deleteProduct(null, "1:abc");
    expect(result).toBeDefined();
    expect(result?.sku).toBe("123");
  });

  it("deleteProduct: should return null if no item found", async () => {
    mockSend.mockResolvedValueOnce({});
    const result = await dal.deleteProduct(null, "1:abc");
    expect(result).toBeNull();
  });

  it("updateProduct: should return updated product", async () => {
    const payload = {
      sku: "NEW",
      name: "Updated",
      price: 10,
      category: { id: "cat2", name: "UpdatedCat" },
    };
    mockSend.mockResolvedValueOnce({
      Attributes: {
        shardId: "1",
        productId: "abc",
        ...payload,
      },
    });

    const result = await dal.updateProduct(null, payload, "1:abc");
    expect(result).toBeDefined();
    expect(result?.sku).toBe("NEW");
  });

  it("createProduct: should return created product", async () => {
    mockSend.mockResolvedValueOnce({});
    const product = new Product(
      "1",
      "abc",
      "SKU1",
      "Apple",
      5,
      new Category("cat1", "Fruit")
    );

    const result = await dal.createProduct(null, product);
    expect(result).toBeDefined();
    expect(result?.sku).toBe("SKU1");
  });
});
