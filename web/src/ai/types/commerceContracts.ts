/**
 * NineCube.Digital - Autonomous Commerce TypeScript Contracts (Architecture v3.1)
 * Decoupled Cognitive Plane & Enforcement Kernel Types
 */

export interface IntentConstraint {
  field: string;
  operator: 'eq' | 'gte' | 'lte' | 'contains';
  value: string | number | boolean;
  source: 'user' | 'profile' | 'system';
}

export interface ProposedAction {
  tool: string;
  arguments: Record<string, unknown>;
  dependsOn: string[];
}

export interface CommerceIntentPlan {
  planId: string;
  sessionId: string;
  requestId: string;
  intent:
    | 'search_products'
    | 'filter_catalog'
    | 'compare_products'
    | 'compare_specs'
    | 'add_to_cart'
    | 'update_cart'
    | 'update_cart_quantity'
    | 'remove_from_cart'
    | 'apply_coupon'
    | 'track_order'
    | 'prepare_checkout'
    | 'authorize_payment';
  targetProductId?: number;
  quantity?: number;
  expectedPrice?: number;
  entities: Record<string, string | number | boolean>;
  constraints: IntentConstraint[];
  unresolvedFields: string[];
  proposedActions: ProposedAction[];
  createdAt: string;
}

export interface ApprovalBindingDto {
  transactionId: string;
  nonceId: string;
  userId: number;
  amount: number;
  currency: string;
  expiresAtUtc: string;
  targetRoute: string;
}

export interface PlanEvaluationResponse {
  decision: 'allow' | 'deny' | 'require_user_approval';
  serverAssignedRiskTier: 1 | 2 | 3;
  policyVersion: string;
  reasonCode: string;
  approvalBinding: ApprovalBindingDto | null;
}

export interface ExecuteTransactionRequest {
  transactionId: string;
  idempotencyKey: string;
  intent: string;
  productId: number;
  quantity: number;
  expectedPrice: number;
  nonceId?: string;
  expectedCartVersion?: number;
}

export interface TransactionExecutionResult {
  transactionId: string;
  succeeded: boolean;
  status: 'succeeded' | 'aborted' | 'compensated' | 'rejected';
  cartVersion: number;
  errorCode?: string;
  message?: string;
  compensatedOperationId?: string;
}
