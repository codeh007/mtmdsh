import type { AdapterDescriptor, CapabilityDescriptor, OperationDescriptor } from "../contract/adapter.ts";
import type { ConnectionInstance } from "../contract/connection.ts";
import type { JsonObject } from "../contract/json.ts";

/** Validated metadata and public input passed to one local adapter execution. */
export interface CapabilityInvocationContext {
  readonly adapter: AdapterDescriptor;
  readonly capability: CapabilityDescriptor;
  readonly operation: OperationDescriptor;
  readonly connection: ConnectionInstance;
  readonly input: JsonObject;
}

export type CapabilityInvocationExecutionResult =
  | {
      readonly ok: true;
      readonly simulated: boolean;
      readonly summary: string;
      readonly data: JsonObject;
    }
  | {
      readonly ok: false;
      readonly code: "adapter-unavailable" | "unsupported-operation" | "invalid-input";
      readonly message: string;
    };

export type CapabilityInvoker = (context: CapabilityInvocationContext) => CapabilityInvocationExecutionResult | PromiseLike<CapabilityInvocationExecutionResult>;
