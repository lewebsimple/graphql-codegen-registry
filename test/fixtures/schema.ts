import { buildSchema, parse } from "graphql";

export const schemaSdl = /* GraphQL */ `
  schema {
    query: Query
    mutation: Mutation
    subscription: Subscription
  }

  type User {
    id: Int!
    email: String!
    name: String
  }

  type Query {
    getUser(id: Int!): User
  }

  type Mutation {
    updateUser(id: Int!, name: String): User
  }

  type Subscription {
    userUpdated(id: Int!): User
  }
`;

export const schema = parse(schemaSdl);
export const schemaAst = buildSchema(schemaSdl);
