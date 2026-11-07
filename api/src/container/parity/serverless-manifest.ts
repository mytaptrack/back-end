/**
 * Builds the source of truth for "what does serverless mode deploy?" by running
 * the real CDK stacks (api/bin/app.ts) against recording doubles of the
 * @mytaptrack/cdk constructs. Executing the stacks, rather than parsing them,
 * means code that exists but is never wired up is correctly reported as absent.
 */
import { join } from 'path';

export interface RestRoute {
  method: string;
  path: string;
  codePath: string;
  handler: string;
  unauthenticated: boolean;
  api: string;
}

export interface LambdaResolver {
  typeName: string;
  fieldName: string;
  codePath: string;
  handler: string;
  auth?: unknown;
}

export interface PipelineResolver {
  typeName: string;
  fieldName: string;
}

export interface LambdaFunction {
  id: string;
  codePath: string;
  handler: string;
  props: Record<string, any>;
}

export interface ServerlessManifest {
  restRoutes: RestRoute[];
  lambdaResolvers: LambdaResolver[];
  pipelineResolvers: PipelineResolver[];
  functions: LambdaFunction[];
}

/** Any property read or call yields another stub, so stack code runs unchanged. */
function deepStub(label: string): any {
  const target = function () {} as any;
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === Symbol.toPrimitive || prop === 'toString') return () => `stub:${label}`;
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === 'toJSON') return () => `stub:${label}`;
      return deepStub(`${label}.${String(prop)}`);
    },
    apply: () => deepStub(`${label}()`),
    construct: () => deepStub(`new ${label}`)
  });
}

/** The env var names MttFunction would inject for these props (see cdk/src/function.ts). */
export function deployedEnvNames(props: Record<string, any>): Set<string> {
  const names = new Set<string>(Object.keys(props.environmentVariables ?? {}));
  const resources = [
    ...(props.tables ?? []).map((x: any) => x.table),
    ...(props.buckets ?? []).map((x: any) => x.bucket),
    ...(props.cognito ?? []).map((x: any) => x.pool),
    ...(props.secrets ?? []).map((x: any) => x.secret),
    ...(props.sqs ?? []).map((x: any) => x.sqs),
    ...(props.ssm ?? []).map((x: any) => x.param),
    ...(props.bedrock ?? []).map((x: any) => x.model),
    ...(props.appsync ?? []).map((x: any) => x.api),
    ...(props.stepFunctions ?? []).map((x: any) => x.stateMachine)
  ];
  resources.forEach(r => {
    const name = r?.envVariable;
    if (typeof name === 'string') names.add(name);
  });
  if (props.events?.length) names.add('EVENT_BUS');
  if (props.sendEmail) names.add('sourceEmail');
  return names;
}

function normalisePath(path: string) {
  return `/${path.replace(/^\/+/, '')}`;
}

export async function loadServerlessManifest(): Promise<ServerlessManifest> {
  const manifest: ServerlessManifest = {
    restRoutes: [],
    lambdaResolvers: [],
    pipelineResolvers: [],
    functions: []
  };

  const recordFunction = (props: any) => {
    if (props?.codePath) {
      manifest.functions.push({
        id: props.id,
        codePath: props.codePath,
        handler: props.handler ?? 'handler',
        props
      });
    }
  };

  class RecordingFunction {
    lambda = deepStub('lambda');
    role = deepStub('role');
    arn = 'stub:arn';
    constructor(_context: any, props: any) {
      recordFunction(props);
      return new Proxy(this, {
        get: (t: any, p) => (p in t ? t[p] : deepStub(`function.${String(p)}`))
      });
    }
  }

  class RecordingRestApi {
    private apiName: string;
    constructor(_context: any, props: any) {
      this.apiName = props?.apiName ?? props?.name ?? props?.id ?? 'nested';
      return new Proxy(this, {
        get: (t: any, p) => (p in t ? t[p] : deepStub(`restApi.${String(p)}`))
      });
    }
    addLambdaHandler(props: any, func?: any) {
      if (!func) recordFunction(props);
      manifest.restRoutes.push({
        method: String(props.method).toUpperCase(),
        path: normalisePath(props.path),
        codePath: props.codePath ?? func?.codePath ?? '',
        handler: props.handler ?? func?.handler ?? 'handler',
        unauthenticated: !!props.unauthenticated,
        api: this.apiName
      });
      return func ?? { codePath: props.codePath, handler: props.handler, lambda: deepStub('lambda') };
    }
  }

  class RecordingAppSync {
    graphqlUrl = 'stub:graphqlUrl';
    envVariable = 'appsyncUrl';
    arn = 'stub:arn';
    apiId = 'stub:apiId';
    constructor() {
      return new Proxy(this, {
        get: (t: any, p) => (p in t ? t[p] : deepStub(`appsync.${String(p)}`))
      });
    }
    addLambdaResolver(_id: string, props: any) {
      recordFunction({ ...props });
      manifest.lambdaResolvers.push({
        typeName: props.typeName,
        fieldName: props.fieldName,
        codePath: props.codePath,
        handler: props.handler ?? 'handler',
        auth: props.auth
      });
      return deepStub('resolver');
    }
    addPipelineResolver(_id: string, props: any) {
      manifest.pipelineResolvers.push({ typeName: props.typeName, fieldName: props.fieldName });
      return deepStub('resolver');
    }
    createResolver(_id: string, props: any) {
      manifest.pipelineResolvers.push({ typeName: props.typeName, fieldName: props.fieldName });
      return deepStub('resolver');
    }
    addNoneDataSource() {
      return deepStub('noneDataSource');
    }
  }

  class RecordingContext {
    config = deepStub('config');
    region = 'us-west-2';
    account = '000000000000';
    environment = 'test';
    stackName: string;
    scope: any;
    constructor(scope: any, stackName: string) {
      this.scope = scope;
      this.stackName = stackName;
      return new Proxy(this, {
        get: (t: any, p) => (p in t ? t[p] : deepStub(`context.${String(p)}`))
      });
    }
    getDataStores() {
      return {
        dataTable: resource('DataTable', 'dataTable'),
        primaryTable: resource('PrimaryTable', 'primaryTable'),
        dataBucket: resource('dataBucket', 'dataBucket')
      };
    }
    getParameter(name: string) {
      return { stringValue: `stub:${name}` };
    }
  }

  const resource = (envVariable: string | undefined, label: string) => {
    const stub = deepStub(label);
    return new Proxy(stub, {
      get: (t, p) => (p === 'envVariable' ? envVariable : t[p])
    });
  };
  class RecordingEnvResource {
    constructor(_context: any, props: any) {
      return resource(props?.envVariable ?? props?.envName, 'resource');
    }
  }
  class RecordingS3 extends RecordingEnvResource {
    static getExisting(_context: any, _name: string, _phi: boolean, envVariable: string) {
      return resource(envVariable, 'bucket');
    }
  }
  class RecordingStepFunction extends RecordingEnvResource {
    static wait = deepStub('wait');
    static succeed = deepStub('succeed');
    static choice = deepStub('choice');
    static lambdaHandler(_context: any, props: any) {
      recordFunction(props);
      return deepStub('lambdaStep');
    }
  }
  const namedTable = {
    fromTableArn: (_context: any, props: any) => resource(props.name, 'table')
  };
  const namedCognito = {
    fromUserPoolId: (_context: any, _pool: any, props: any) => resource(props.envVariable, 'cognito')
  };

  const stubbed = {
    MttContext: RecordingContext,
    MttFunction: RecordingFunction,
    MttRestApi: RecordingRestApi,
    AppSyncApi: RecordingAppSync,
    MttS3: RecordingS3,
    MttSqs: RecordingEnvResource,
    MttStepFunction: RecordingStepFunction,
    MttParameter: RecordingEnvResource,
    MttDynamoDB: namedTable,
    MttCognito: namedCognito
  };

  const actual = await vi.importActual<Record<string, any>>('@mytaptrack/cdk');
  vi.doMock('@mytaptrack/cdk', () => {
    return Object.fromEntries(Object.keys({ ...actual, ...stubbed }).map(name => [name, (() => {
      {
        const prop = name;
        const target = actual;
        if (prop in stubbed) return stubbed[prop as keyof typeof stubbed];
        const value = target[prop];
        // Keep enums and plain values; replace every other construct class.
        const isClass = typeof value === 'function' && /^class\s/.test(Function.prototype.toString.call(value));
        return isClass ? deepStub(String(prop)) : value;
      }
    })()]));
  });

  // Constructors do the wiring we record; synth would only choke on the stubs.
  const { App } = await import('aws-cdk-lib');
  const synth = vi.spyOn(App.prototype, 'synth').mockReturnValue(undefined as any);
  const silenced = (['log', 'info', 'debug'] as const).map(level =>
    vi.spyOn(console, level).mockImplementation(() => undefined));
  vi.resetModules();
  try {
    await import(/* @vite-ignore */ join(__dirname, '../../../bin/app'));
  } finally {
    synth.mockRestore();
    silenced.forEach(spy => spy.mockRestore());
    vi.doUnmock('@mytaptrack/cdk');
    vi.resetModules();
  }
  return manifest;
}
