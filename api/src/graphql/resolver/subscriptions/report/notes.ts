import { MttAppSyncContext, WebUtils } from "@mytaptrack/lib";
import { AccessLevel } from "@mytaptrack/types";

export const handler = WebUtils.graphQLWrapper(handleEvent, { student: { comments: AccessLevel.read } });

interface AppSyncParams {
    studentId: string;
}

export async function handleEvent(context: MttAppSyncContext<AppSyncParams, never, never, {}>): Promise<any> {
    console.info(context);
    return null;
}
