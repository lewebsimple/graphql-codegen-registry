import type { Types } from "@graphql-codegen/plugin-helpers";
import { buildSchema, parse } from "graphql";
import { describe, expect, it } from "vitest";

import * as registryPlugin from "../src/plugin";

const toDocuments = (source: string): Types.DocumentFile[] => {
  return [
    {
      location: "fixtures/documents.graphql",
      document: parse(source),
    },
  ];
};

describe("registryPlugin", () => {
  it("exports plugin entrypoint in codegen-compatible shape", () => {
    expect(typeof registryPlugin.plugin).toBe("function");
  });

  it("generates operation and fragment document imports compatible with typed-document-node naming", () => {
    const schema = buildSchema(/* GraphQL */ `
      type User {
        id: ID!
      }

      type Query {
        getUser(id: ID!): User
      }
    `);
    const documents = toDocuments(/* GraphQL */ `
      fragment viewer_profile on User {
        id
      }

      query get_user($id: ID!) {
        getUser(id: $id) {
          ...viewer_profile
        }
      }
    `);

    const operationOutput = registryPlugin.plugin(schema, documents, {
      mode: "operation",
      operationType: "query",
      name: "get_user",
    });
    const fragmentOutput = registryPlugin.plugin(schema, documents, {
      mode: "fragment",
      name: "viewer_profile",
    });

    expect(operationOutput).toContain('import { Get_UserDocument } from "../documents";');
    expect(operationOutput).toContain(
      'import { schema as gqlviewer_profileFragmentSchema } from "../fragments/viewer_profile";',
    );
    expect(operationOutput).toContain("export const document = Get_UserDocument;");
    expect(operationOutput).toContain("getUser: gqlviewer_profileFragmentSchema.nullable()");
    expect(operationOutput).not.toContain(
      "z.intersection(z.object({}), gqlviewer_profileFragmentSchema)",
    );

    expect(fragmentOutput).toContain('import { Viewer_ProfileFragmentDoc } from "../documents";');
    expect(fragmentOutput).toContain("export const document = Viewer_ProfileFragmentDoc;");
  });

  it("matches typed-document-node naming for acronym segments", () => {
    const schema = buildSchema(/* GraphQL */ `
      type Query {
        x: Int
      }
    `);
    const documents = toDocuments(/* GraphQL */ `
      query getURL_data {
        x
      }
    `);

    const operationOutput = registryPlugin.plugin(schema, documents, {
      mode: "operation",
      operationType: "query",
      name: "getURL_data",
    });

    expect(operationOutput).toContain('import { GetUrl_DataDocument } from "../documents";');
    expect(operationOutput).toContain("export const document = GetUrl_DataDocument;");
  });

  it("builds interface selections as unions of conditional variants", () => {
    const schema = buildSchema(/* GraphQL */ `
      interface Node {
        id: ID!
      }

      type User implements Node {
        id: ID!
        email: String!
      }

      type Admin implements Node {
        id: ID!
        role: String!
      }

      type Query {
        node: Node
      }
    `);
    const documents = toDocuments(/* GraphQL */ `
      query GetNode {
        node {
          id
          ... on User {
            email
          }
          ... on Admin {
            role
          }
        }
      }
    `);

    const operationOutput = registryPlugin.plugin(schema, documents, {
      mode: "operation",
      operationType: "query",
      name: "GetNode",
    });

    expect(operationOutput).toContain("node: z.union([");
    expect(operationOutput).toContain("email: z.string()");
    expect(operationOutput).toContain("role: z.string()");
  });

  it("builds union field selections instead of falling back to unknown", () => {
    const schema = buildSchema(/* GraphQL */ `
      type User {
        id: ID!
        email: String!
      }

      type Admin {
        id: ID!
        role: String!
      }

      union Account = User | Admin

      type Query {
        account: Account
      }
    `);
    const documents = toDocuments(/* GraphQL */ `
      query GetAccount {
        account {
          ... on User {
            id
            email
          }
          ... on Admin {
            id
            role
          }
        }
      }
    `);

    const operationOutput = registryPlugin.plugin(schema, documents, {
      mode: "operation",
      operationType: "query",
      name: "GetAccount",
    });

    expect(operationOutput).toContain("account: z.union([");
    expect(operationOutput).not.toContain("account: z.unknown()");
  });

  it("avoids fragment schema alias collisions for case and underscore variants", () => {
    const schema = buildSchema(/* GraphQL */ `
      type User {
        id: ID!
        email: String
      }

      type Query {
        getUser: User
      }
    `);
    const documents = toDocuments(/* GraphQL */ `
      fragment UserProfile on User {
        id
      }

      fragment user_profile on User {
        email
      }

      query GetUser {
        getUser {
          ...UserProfile
          ...user_profile
        }
      }
    `);

    const operationOutput = registryPlugin.plugin(schema, documents, {
      mode: "operation",
      operationType: "query",
      name: "GetUser",
    });

    expect(operationOutput).toContain(
      'import { schema as gqlUserProfileFragmentSchema } from "../fragments/UserProfile";',
    );
    expect(operationOutput).toContain(
      'import { schema as gqluser_profileFragmentSchema } from "../fragments/user_profile";',
    );
  });

  it("avoids enum schema alias collisions for case and underscore variants", () => {
    const schema = buildSchema(/* GraphQL */ `
      enum UserRole {
        ADMIN
      }

      enum user_role {
        USER
      }

      type User {
        roleA: UserRole!
        roleB: user_role!
      }

      type Query {
        user: User
      }
    `);
    const documents = toDocuments(/* GraphQL */ `
      query GetUser {
        user {
          roleA
          roleB
        }
      }
    `);

    const operationOutput = registryPlugin.plugin(schema, documents, {
      mode: "operation",
      operationType: "query",
      name: "GetUser",
    });

    expect(operationOutput).toContain(
      'import { schema as gqlUserRoleEnumSchema } from "../enums/UserRole";',
    );
    expect(operationOutput).toContain(
      'import { schema as gqluser_roleEnumSchema } from "../enums/user_role";',
    );
  });
});
