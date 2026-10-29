export class Order {
  public key: string;
  public orderName: string;
  public orderProducts: OrderProduct[];

  constructor(
    shardId: string,
    orderId: string,
    orderName: string,
    orderProducts: OrderProduct[]
  ) {
    this.key = `${shardId}:${orderId}`;
    this.orderName = orderName;
    this.orderProducts = orderProducts;
  }

  static fromItem(item: any): Order {
    const products = item.orderProducts.map(
      (prod: OrderProduct) =>
        new OrderProduct(prod.productId, prod.price, prod.quantity)
    );
    return new Order(item.shardId, item.orderId, item.orderName, products);
  }

  toItem() {
    return {
      shardId: this.key.split(":")[0],
      orderId: this.key.split(":")[1],
      orderName: this.orderName,
      orderProducts: this.orderProducts.map((p) => ({
        productId: p.productId,
        price: p.price,
        quantity: p.quantity,
      })),
    };
  }
}

export class OrderProduct {
  public productId: string;
  public price: number;
  public quantity: number;
  constructor(productId: string, price: number, quantity: number) {
    this.productId = productId;
    this.price = price;
    this.quantity = quantity;
  }
}
