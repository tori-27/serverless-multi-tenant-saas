export class Product {
  public key: string;
  public sku: string;
  public name: string;
  public price: number;
  public category: Category;

  constructor(
    shardId: string,
    productId: string,
    sku: string,
    name: string,
    price: number,
    category: Category
  ) {
    this.key = `${shardId}:${productId}`;
    this.sku = sku;
    this.name = name;
    this.price = price;
    this.category = category;
  }

  static fromItem(item: any): Product {
    const category = new Category(item.category.id, item.category.name);
    return new Product(
      item.shardId,
      item.productId,
      item.sku,
      item.name,
      item.price,
      category
    );
  }

  toItem() {
    const [shardId, productId] = this.key.split(":");
    return {
      shardId,
      productId,
      sku: this.sku,
      name: this.name,
      price: this.price,
      category: { id: this.category.id, name: this.category.name },
    };
  }
}

export class Category {
  public id: string;
  public name: string;
  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }
}
