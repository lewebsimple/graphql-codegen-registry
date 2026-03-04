import { parse } from "graphql";

export const documents = [
  {
    location: "fixtures/get-user.graphql",
    document: parse(/* GraphQL */ `
      fragment Viewer on User {
        id
        email
        name
      }

      query GetUser($id: Int!) {
        getUser(id: $id) {
          ...Viewer
        }
      }

      mutation UpdateUser($id: Int!, $name: String) {
        updateUser(id: $id, name: $name) {
          ...Viewer
        }
      }

      subscription UserUpdated($id: Int!) {
        userUpdated(id: $id) {
          ...Viewer
        }
      }
    `),
  },
];
