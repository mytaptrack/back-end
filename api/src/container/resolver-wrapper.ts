import type { FieldNode, GraphQLResolveInfo } from 'graphql';
import { MttAppSyncContext, MttAppSyncIdentity } from '@mytaptrack/lib';

/** What the GraphQL server passes to each root resolver as its context. */
export interface ContainerGraphQLContext {
  docClient?: unknown;
  rabbitChannel?: unknown;
  identity?: MttAppSyncIdentity | null;
  headers?: Record<string, unknown>;
  permissions?: unknown;
}

type ResolverEvent<Args> = MttAppSyncContext<Args, any, any, any>;
type ResolverHandler<Args> = (event: ResolverEvent<Args>) => unknown;

function selectedFields(info?: Partial<GraphQLResolveInfo>): string[] {
  return (info?.fieldNodes?.[0]?.selectionSet?.selections ?? [])
    .filter((selection): selection is FieldNode => selection.kind === 'Field')
    .map(selection => selection.name.value);
}

/** Builds the event AppSync would send, so Lambda resolvers run unchanged in containers. */
export function createAppSyncContext<Args>(
  args: Args,
  context: ContainerGraphQLContext,
  info?: Partial<GraphQLResolveInfo>
): ResolverEvent<Args> {
  return {
    arguments: args,
    source: {},
    result: {},
    prev: { result: {} },
    stash: {
      permissions: context.permissions ?? {}
    },
    info: {
      fieldName: info?.fieldName ?? '',
      parentTypeName: info?.parentType?.name ?? '',
      variables: info?.variableValues ?? {},
      selectionSetList: selectedFields(info),
      selectionSetGraphQL: ''
    },
    request: {
      headers: context.headers ?? {},
      domainName: null
    },
    identity: context.identity
      ? { ...context.identity, claims: context.identity.claims ?? context.identity }
      : null,
    transformedTemplate: ''
  };
}

export function wrapResolver<Args>(handler: ResolverHandler<Args>) {
  return async (args: Args, context: ContainerGraphQLContext, info?: Partial<GraphQLResolveInfo>) =>
    handler(createAppSyncContext(args, context, info));
}

export function createContext(docClient: unknown, rabbitChannel: unknown, identity?: MttAppSyncIdentity): ContainerGraphQLContext {
  return {
    docClient,
    rabbitChannel,
    identity,
    headers: {}
  };
}
