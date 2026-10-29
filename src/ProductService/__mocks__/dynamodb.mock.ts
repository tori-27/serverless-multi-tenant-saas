export const mockSend = jest.fn();

jest.mock("@aws-sdk/lib-dynamodb", () => {
  const actual = jest.requireActual("@aws-sdk/lib-dynamodb");
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn().mockReturnValue({ send: mockSend }),
    },
    GetCommand: jest.fn(),
    PutCommand: jest.fn(),
    UpdateCommand: jest.fn(),
    DeleteCommand: jest.fn(),
    ScanCommand: jest.fn(),
    QueryCommand: jest.fn(function QueryCommand() {}),
  };
});
