import { Context } from '@aws-appsync/utils';

export function wrapResolver(handler: Function) {
  return async (args: any, context: any, info: any) => {
    // Extract selection set from GraphQL info
    const selectionSetList = info?.fieldNodes?.[0]?.selectionSet?.selections?.map((selection: any) => selection.name.value) || [];
    
    const appsyncContext: Context = {
      env: (process.env as Record<string, string>) || {},
      arguments: args,
      args,
      source: {},
      result: {},
      prev: { result: {} },
      stash: {
        permissions: context.permissions || {}
      },
      info: {
        fieldName: info?.fieldName || '',
        parentTypeName: info?.parentType?.name || '',
        variables: info?.variableValues || {},
        selectionSetList: selectionSetList,
        selectionSetGraphQL: info?.fieldNodes?.[0]?.selectionSet ? '' : ''
      },
      request: {
        headers: context.headers || {},
        domainName: null
      },
      identity: context.identity
        ? { ...context.identity, claims: context.identity }
        : null,
      error: null
    };

    const result = await handler(appsyncContext);
    return result;
  };
}

export function createContext(docClient: any, rabbitChannel: any, identity?: any) {
  return {
    docClient,
    rabbitChannel,
    identity,
    headers: {}
  };
}
