import type { z } from "zod";

export const registry = {
  operations: {
    GetUser: {
      load: () => import("./operations/GetUser"),
    },
  },

  fragments: {
    Viewer: {
      load: () => import("./fragments/Viewer"),
    },
  },

  enums: {
    UserRole: {
      load: () => import("./enums/UserRole"),
    },
  },
} as const;

export type OperationName = keyof typeof registry.operations;
type OperationNameByKind<TKind extends "query" | "mutation" | "subscription"> = {
  [TName in OperationName]: LoadedOperation<TName>["kind"] extends TKind ? TName : never;
}[OperationName];

export type QueryName = OperationNameByKind<"query">;
export type MutationName = OperationNameByKind<"mutation">;
export type SubscriptionName = OperationNameByKind<"subscription">;

export type FragmentName = keyof typeof registry.fragments;
export type EnumName = keyof typeof registry.enums;

type LoadedOperation<T extends OperationName> = Awaited<
  ReturnType<(typeof registry.operations)[T]["load"]>
>;
type LoadedFragment<T extends FragmentName> = Awaited<
  ReturnType<(typeof registry.fragments)[T]["load"]>
>;
type LoadedEnum<T extends EnumName> = Awaited<ReturnType<(typeof registry.enums)[T]["load"]>>;

export type VariablesOf<T extends OperationName> = z.input<LoadedOperation<T>["variablesSchema"]>;
export type ResultOf<T extends OperationName> = z.infer<LoadedOperation<T>["schema"]>;
export type FragmentOf<T extends FragmentName> = z.infer<LoadedFragment<T>["schema"]>;
export type EnumOf<T extends EnumName> = z.infer<LoadedEnum<T>["schema"]>;

export const loadOperation = <T extends OperationName>(name: T) => registry.operations[name].load();
export const loadFragment = <T extends FragmentName>(name: T) => registry.fragments[name].load();
export const loadEnum = <T extends EnumName>(name: T) => registry.enums[name].load();
