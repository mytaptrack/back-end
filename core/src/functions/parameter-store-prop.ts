import { WebUtils } from "@mytaptrack/lib";
import { Context } from "aws-lambda";
import { 
    SSMClient, DescribeParametersCommand, GetParameterCommand, PutParameterCommand,
    ParameterType, DeleteParameterCommand
} from "@aws-sdk/client-ssm";

export const handler = WebUtils.lambdaWrapper(eventHandler);

const localSSM = new SSMClient();

async function eventHandler(event: any, context: Context) {
    console.log(JSON.stringify(event));
    if(process.env.primaryRegion != process.env.AWS_REGION) {
        return;
    }

    if(!event.detail) {
        let token;
        do {
            const results = await localSSM.send(new DescribeParametersCommand({
                ParameterFilters: [{
                    Key: 'Name',
                    Values: [`/${process.env.environment}/`],
                    Option: 'BeginsWith'
                }],
                NextToken: token
            }));

            token = results.NextToken;
            for(let parm of results.Parameters) {
                await transferParameter(parm.Name, parm.Type, 'Update');
            }
        } while(token);
    } else {
        console.log(event.detail.name);
        console.log(JSON.stringify(event));
        await transferParameter(event.detail.name, event.detail.type, event.detail.operation);
    }
}

async function transferParameter(name: string, type: ParameterType, operation: string) {
    if(name.indexOf('regional') >= 0 ||
        name.indexOf('calc') >= 0) {
        return;
    }

    const param = operation != 'Delete'? (await localSSM.send(new GetParameterCommand({
        Name: name,
        WithDecryption: true
    }))) : { Parameter: { Value: ''}};

    const regions = JSON.parse(process.env.regions);

    await Promise.all(regions.map(async r => {
        if(r == process.env.AWS_REGION) {
            return;
        }
        console.log('Adjusting region', r, name);
        const ssm = new SSMClient({ region: r });
        if(operation != 'Delete') {
            await ssm.send(new PutParameterCommand({
                Name: name,
                Type: type,
                Value: param.Parameter.Value,
                Overwrite: true
            }));
        } else {
            await ssm.send(new DeleteParameterCommand({
                Name: name
            }));
        }
    }));
}
