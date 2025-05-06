process.env.DEBUG = "aws-transcribe:\*";

import { APIGatewayEvent } from "aws-lambda";
import { WebUtils, v2, moment, WebError, LambdaAppsyncQueryClient } from '@mytaptrack/lib';
import { TrackDataRequest, TrackDataResponse } from '../../library';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DeleteSessionCommand, LexRuntimeServiceClient, PostContentCommand, PutSessionCommand } from '@aws-sdk/client-lex-runtime-service'
import { VoiceManifest } from '@mytaptrack/stack-lib';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PassThrough, Readable } from "stream";
import * as fs from "fs";
import { QLStudentNote } from "@mytaptrack/types";
import shortUUID from 'short-uuid';
    

let s3 = new S3Client();

interface AudioData {
    dsn: string;
    audio: Buffer;
    eventDate: string;
    url?: string;
}

export const put = WebUtils.lambdaWrapper(handler);

const appsync = new LambdaAppsyncQueryClient(process.env.appsyncUrl)

async function handler(event: APIGatewayEvent) {
    const audioData: AudioData = !event.isBase64Encoded && event.headers['Content-Type'] != 'application/octet'? 
        await getS3Audio(event) : await getStreamAudio(event); 

    if(!audioData) {
        throw new WebError('Could not read audio');
    }

    if(audioData.url) {
        return WebUtils.done(null, '200', {
            success: true,
            url: audioData.url
        } as TrackDataResponse, event);
    }
    let success = true;
    try {
        if(WebUtils.isDebug) {
            await s3.send(new PutObjectCommand({
                Bucket: process.env.voiceBucket,
                Key: `raw/dsn/${audioData.dsn}`,
                Body: audioData.audio,
                ContentLength: audioData.audio.length,
                ServerSideEncryption: 'aws:kms'
            }));
        }
        const text = await getTextFromLex(audioData.audio, audioData.dsn);

        console.log('Lex Text', text);
        // WebUtils.logObjectDetails(text);
        if (/(note|nope) .*/i.test(text)) {
            await processNote(text, audioData);
        } else if (/track to .+/i.test(text)) {

        } else if (/set switch to .+/i.test(text)) {
            await processSetCodeWord(text, audioData);
        } else if (/switch .*/i.test(text)) {
            await processSwitch(text, audioData);
        } else {
            WebUtils.setError(new Error(`The command did not work ${audioData.dsn}`));
            return WebUtils.done('Command not understood', '400', null, event);
        }
    } catch(err) {
        console.error(err);
        WebUtils.setError(err);
        return WebUtils.done('Processing error', '500', null, event);
    }

    return WebUtils.done(null, '200', { success }, event);
}

async function getS3Audio(event: APIGatewayEvent): Promise<AudioData> {
    WebUtils.logObjectDetails(event);
    event.body = event.body.replace('\u0001', '');
    const request = JSON.parse(event.body) as TrackDataRequest;
    if(WebUtils.isDebug && request.dsn === '') {
        request.dsn = 'M200000000000001'
    }
    if(WebUtils.isDebug) {
        if(request.dsn && request.dsn.length < 16) {
            request.dsn = request.dsn.padEnd(16, '0');
        }
    }

    if(!request.dsn || !request.identity || !request.dsn.match('M2[A-Z0-9]{10}')) {
        const error = 'dsn/identity was not supplied';
        console.log(error);
        WebUtils.setError(new Error(error));
        throw new Error(error);
    }
    if(!request.pressType) {
        const error = 'pressType was not supplied';
        console.log(error);
        WebUtils.setError(new Error(error));
        throw new Error(error);
    }

    const eventDate = new Date(request.eventDate);
    if(!request.eventDate || isNaN(eventDate.getTime())) {
        const error = 'Event date cannot be read';
        console.log(error);
        throw new Error(error);
    }

    const identity = await v2.DeviceDal.getIdentity(request.dsn);
    WebUtils.logObjectDetails(identity);

    if(identity && identity.identity && identity.identity !== request.identity) {
        const error = `Could not process request for ${request.dsn} due to invalid identity ${request.identity}`;
        console.log(error);
        throw new Error(error);

    }

    if(request.segment === undefined) {
        throw new Error('segment not specified');
    }
    if(request.complete === undefined) {
        throw new Error('complete not specified');
    }

    if(!request.complete) {
        //
        // Create url to save segment
        //
        const key = `raw/${request.dsn}/${new Date(request.eventDate).getTime()}-${request.segment}.pcm`;

        const url = await getSignedUrl(s3, new PutObjectCommand({
            Bucket: process.env.voiceBucket,
            Key: key,
            ContentType: 'application/octet',
            ServerSideEncryption: 'AES256',
        }), { expiresIn: 900 });

        return {
            dsn: request.dsn,
            url,
            audio: null,
            eventDate: request.eventDate
        };
    }
    
    //
    // All segments are compete
    //
    const manifest: VoiceManifest = {
        version: 1,
        timestamp: request.eventDate,
        parts: []
    };
    for(let i = 0; i <= request.segment; i++) {
        manifest.parts.push(`raw/${request.dsn}/${new Date(request.eventDate).getTime()}-${i}.pcm`);
    }

    const audioParts = await Promise.all(manifest.parts.map(async x => {
        try {
            const response = await s3.send(new GetObjectCommand({
                Bucket: process.env.voiceBucket,
                Key: x
            }));
            return await response.Body.transformToByteArray();    
        } catch (err) {
            if(err.code != 'AccessDenied') {
                console.error('error', err);
                throw err;
            }
        }
    }));
    if(!audioParts.find(x => x.length > 0)) {
        return null;
    }
    const audio = Buffer.concat(audioParts);

    return {
        dsn: request.dsn,
        audio,
        eventDate: request.eventDate
    };
}

async function getStreamAudio(event: APIGatewayEvent): Promise<AudioData> {
    const raw = event.body;
    const buffer = Buffer.from(raw, 'base64');
    console.debug('Raw data type ', typeof raw, ' ', raw);
    event.body = '...';
    event['bodyLength'] = buffer.length;
    console.debug(event);

    console.info('DSN: ', event.headers.dsn);
    const dsn = event.headers.dsn.slice(0, 16);

    // if(WebUtils.isDebug) {
    //     console.log(`Writing data to bucket ${process.env.voiceBucket} at path "test/dsn/${dsn}"`)
    //     await s3.send(new PutObjectCommand({
    //         Bucket: process.env.voiceBucket,
    //         Key: `test/dsn/${dsn}`,
    //         Body: raw,
    //         ContentLength: raw.length,
    //         ServerSideEncryption: 'aws:kms'
    //     }));
    // }
    console.debug("Buffer size ", buffer.length);
    if(buffer.length < 4) {
        throw new WebError("Message not long enough");
    }

    const audioLength = buffer.readInt32LE(buffer.length - 4);
    
    console.log(`Buffer length: ${buffer.length}`);
    console.log(`Audio length: ${audioLength}`);
    console.log(`Dsn: ${dsn}`);

    console.log('Returning data and buffer');
    return {
        dsn,
        audio: buffer.slice(0, audioLength),
        eventDate: moment().toString()
    };
}

async function processSetCodeWord(message: string, request: AudioData) {
    console.log('process set codeword started');
    const codeWordMatch = message.match(/(?<=(^set switch to\W)).+/i);
    if(codeWordMatch[0].trim().length == 0) {
        throw new Error('Set switch to command missing');
    }
    const device = await v2.DeviceDal.get(request.dsn);
    WebUtils.logObjectDetails(device);
    WebUtils.logObjectDetails(codeWordMatch);
    console.log('StudentId', device.studentId);

    if(!device.termSetup || !device.multiStudent) {
        throw new Error('Code word setup not enabled');
    }

    const command = device.commands.find(x => x.studentId == device.studentId);
    if(!command) {
        throw new Error('Command not found');
    }

    command.term = codeWordMatch[0];
    console.log('Setting codeword', command.term);
    device.termSetup = false;

    WebUtils.logObjectDetails(device);
    console.log('Saving device');
    await v2.DeviceDal.updateExistingCommands(device);
    console.log('Device saved');
}

async function processNote(message: string, request: AudioData) {
    console.log('processNote Started');
    const noteMatch = message.match(/(?<=(^(note|nope)\W)).+/i);
    const device = await v2.DeviceDal.get(request.dsn);
    console.debug('Device', device);
    const date = device.timezone? moment(request.eventDate).tz(device.timezone) : moment(request.eventDate);

    const dateString = date.format('M/D/YYYY');
    console.log('StudentId', device.studentId);

    const result = await appsync.query<QLStudentNote>(`
        mutation updateNotes($input: StudentNoteInput!) {
            updateNotes(input: $input) {
                date
                dateEpoc
                note
                noteDate
                noteId
                product
                source {
                    id
                    name
                    type
                }
                studentId
            }
        }
        `,
        {
            input: {
                date: dateString,
                dateEpoc: date.toDate().getTime(),
                note: message.replace(/^(note|nope)\W/, ''),
                noteDate: date.clone().tz(device.timezone).startOf('day').toDate().getTime(),
                noteId: shortUUID().uuid().toString(),
                product: 'behavior',
                source: {
                    id: device.dsn,
                    name: device.deviceName,
                    type: 'track'
                },
                studentId: device.studentId
            } as QLStudentNote
        }, 'getTrackForDevice');
    // await v2.NotesDal.updateNotes(device.studentId, dateString, notes.lastUpdate, dateString, notes.notes);
}

async function processSwitch(message: string, request: AudioData) {
    const match = message.match(/(?<=(^switch to\W)).+/i);
    WebUtils.logObjectDetails(match);
    if(!match[0].trim()) {
        throw new Error('No command word found');
    }
    const device = await v2.DeviceDal.get(request.dsn);
    WebUtils.logObjectDetails(device);
    const config = device.commands.find(x => x.term === match[0])
    if(!config) {
        throw new Error('Could not find command');
    }

    device.studentId = config.studentId;
    await v2.DeviceDal.update(device);
}

async function getTextFromLex(audio, dsn): Promise<string> {
    const lex = new LexRuntimeServiceClient({});


    const session = await lex.send(new PutSessionCommand({
        botName: process.env.voiceBotName,
        botAlias: process.env.voiceBotAlias,
        userId: dsn
    }));
    console.info('Sending stream to lex');
    const response = await lex.send(new PostContentCommand({
        botName: process.env.voiceBotName,
        botAlias: process.env.voiceBotAlias,
        userId: dsn,
        contentType: 'audio/l16; rate=16000; channels=1',
        inputStream: audio,
        accept: 'text/plain; charset=utf-8'
    }));
    console.debug('Response received from lex', response.inputTranscript);

    await lex.send(new DeleteSessionCommand({
        botName: process.env.voiceBotName,
        botAlias: process.env.voiceBotAlias,
        userId: dsn
    }));
    
    return response.inputTranscript;
}
