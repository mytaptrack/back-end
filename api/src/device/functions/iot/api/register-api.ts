import { LambdaAppsyncQueryClient, WebError, WebUtils, moment } from "@mytaptrack/lib";
import { APIGatewayEvent } from "aws-lambda";
import { Dal, DalKey } from "@mytaptrack/lib/dist/v2/dals/dal";
import { AddThingToThingGroupCommand, AttachPolicyCommand, AttachThingPrincipalCommand, CreateKeysAndCertificateCommand, CreatePolicyCommand, CreateThingCommand, CreateTopicRuleCommand, IoTClient } from '@aws-sdk/client-iot'
import { IoTRegistration } from "../types/iot-registration";

export const eventHandler = WebUtils.lambdaWrapper(handler);

const data = new Dal('data');
const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl)

const awsCert = `-----BEGIN CERTIFICATE-----
MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF
ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6
b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL
MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv
b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj
ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM
9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw
IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6
VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L
93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm
jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC
AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA
A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI
U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs
N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv
o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU
5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy
rqXRfboQnoZsG4q5WTP468SQvvG5
-----END CERTIFICATE-----
`;

const iot = new IoTClient({});

interface EventBody {
    dsn: string;
    identity: string;
}

async function handler(event: APIGatewayEvent) {
    console.log("Event: ", event);
    const request: EventBody = event.body ? JSON.parse(event.body) : {} as any;
    if (!request.dsn || !request.identity || !request.dsn.match('M2[A-Z0-9]{10}')) {
        const error = 'dsn/identity was not supplied';
        console.log(error);
        WebUtils.setError(new Error(error));
        return WebUtils.done(error, '400', null, event);
    }

    if (request.dsn.length > 16) {
        request.dsn = request.dsn.slice(0, 16);
    }

    const key: DalKey = { pk: `TRACK#${request.dsn}`, sk: 'iotreg' };
    let regData = await data.get<IoTRegistration>(key);

    console.debug("Result: ", regData);
    if (!regData) {
        const thingResult = await iot.send(new CreateThingCommand({
            thingName: request.dsn,
            thingTypeName: 'Track20',
            attributePayload: {
                attributes: {
                    'dsn': request.dsn
                }
            }
        }));
        regData = { 
            ...key,
            thingName: thingResult.thingName!,
            thingArn: thingResult.thingArn!,
            inGroup: false
        };
        await data.put(regData);
    }

    if(!regData.inGroup) {
        await iot.send(new AddThingToThingGroupCommand({
            thingGroupName: 'Track20',
            thingArn: regData.thingArn
        }));
        regData.inGroup = true;
        await data.put(regData);
    }

    if (!regData.cert) {
        const cert = await iot.send(new CreateKeysAndCertificateCommand({
            setAsActive: true
        }));

        regData.cert = {
            certificateArn: cert.certificateArn!,
            certificateId: cert.certificateId!,
            keyPair: cert.keyPair,
            pem: cert.certificatePem!
        }
        regData.certDate = moment().toDate().getTime();
        await data.put(regData);
    }

    if(!regData.certAttached) {
        await iot.send(new AttachThingPrincipalCommand({
            thingName: request.dsn,
            principal: regData.cert.certificateArn!
        }));
        await iot.send(new AttachPolicyCommand({
            policyName: process.env.ThingPolicy,
            target: regData.cert.certificateArn!
        }));
        regData.certAttached = true;
        await data.put(regData);
    }

    const retval = {
        statusCode: 200,
        body: awsCert + '\n\n\n' + regData.cert.keyPair.PrivateKey! + '\n\n\n' + regData.cert.pem
    };
    console.log("Result: ", retval);

    return retval;
}
