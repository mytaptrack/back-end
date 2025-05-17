#!/usr/bin/env node
import { GetParametersCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ConfigFile } from '@mytaptrack/cdk';

const ENVIRONMENT = process.argv[2] ?? 'test';

interface PathValue {
    path: string;
    value: string;
}

async function recursiveConstruct(path: string, input: any): Promise<PathValue[]> {
    let retval: PathValue[] = [];
    // If the input is an object, loop through each key
    if (typeof input === 'object') {
        if(path != '') {
            retval.push({ path, value: JSON.stringify(input) });
        }

        for (const key in input) {
            if (input.hasOwnProperty(key)) {
                const value = input[key];
                const newPath = `${path}/${key}`;
                const result = await recursiveConstruct(newPath, value);
                retval.push(...result);
            }
        }
    } else {
        // If the input is not an object, it's a value, so print it
        console.log(`${path}: ${input}`);
        if(input != undefined && input != null && input != '') {
          retval.push({ path, value: input.toString() });
        }
    }
    return retval;
}

async function main() {
  const configFile = new ConfigFile('../config', ENVIRONMENT);
  configFile.config[ENVIRONMENT] = configFile.config.env;
  delete configFile.config.env;

  console.log("Evaluating keys");
  const params = await recursiveConstruct('', configFile.config);

  console.log("Evaluating stored values")
  const ssm = new SSMClient();

  let existing: PathValue[] = [];
  for(let i = 0; i < params.length; i += 10) {
    let end = i + 10;
    if(end > params.length) {
      end = params.length;
    }
    const response = await ssm.send(new GetParametersCommand({
      Names: params.slice(i, end).map(x => x.path)
    }));

    if(response.Parameters) {
      existing.push(...response.Parameters.map(x => {
        return { path: x.Name, value: x.Value } as PathValue;
      }));
    }
  }

  // Loop through each parameter and see if it exists
  for(let i = 0; i < params.length; i++) {
    const param = params[i];
    const existingParam = existing.find(x => x.path == param.path);
    if(existingParam?.value == param.value) {
      console.log(`Skipping ${param.path}`);
      params.splice(i, 1);
      i--;
    }
  }

  // Set parameters that need to be set
  console.log("Setting parameters");
  for(let i = 0; i < params.length; i++) {
    const param = params[i];
    console.log(`Setting ${param.path}`);

    if(param.path.endsWith('/app/tokenKey')) {
      await ssm.send(new PutParameterCommand({
        Name: param.path,
        Value: param.value,
        Type: 'SecureString',
        Overwrite: true,
      }));
    } else {
      await ssm.send(new PutParameterCommand({
        Name: param.path,
        Value: param.value,
        Type: 'String',
        Overwrite: true
      }));
    }
    // Wait 200 milliseconds
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

main();