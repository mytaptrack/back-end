import { SAML } from 'passport-saml';
import { AuthManager } from './auth-manager';

const SAML_CERT = process.env.SAML_CERT || '';
const SAML_ENTRY_POINT = process.env.SAML_ENTRY_POINT || 'http://localhost:8080/simplesaml/saml2/idp/SSOService.php';
const SAML_ISSUER = process.env.SAML_ISSUER || 'mytaptrack-local';
const SAML_CALLBACK_URL = process.env.SAML_CALLBACK_URL || 'http://localhost:3000/auth/saml/callback';

const samlConfig = {
    entryPoint: SAML_ENTRY_POINT,
    issuer: SAML_ISSUER,
    callbackUrl: SAML_CALLBACK_URL,
    cert: SAML_CERT || 'dummy-cert-for-local-dev',
    acceptedClockSkewMs: 5000,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'
};

const saml = SAML_CERT ? new SAML(samlConfig) : null;

export interface SAMLProfile {
    nameID: string;
    email: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
}

export class SAMLHandler {
    static async validateAndGenerateToken(samlResponse: string): Promise<{ token: string, refreshToken: string, user: any } | null> {
        try {
            if (!saml) {
                return null;
            }

            // Validate SAML response
            const profile = await saml.validatePostResponse({ SAMLResponse: samlResponse }) as any;
            
            if (!profile || !profile.nameID) {
                console.error('Invalid SAML profile');
                return null;
            }

            // Extract user information from SAML assertion
            const userId = profile.nameID;
            const email = profile.email || profile.nameID;
            const firstName = profile.firstName || profile.givenName || '';
            const lastName = profile.lastName || profile.surname || '';
            const displayName = profile.displayName || `${firstName} ${lastName}`.trim() || email;
            const groups = profile.groups || profile['cognito:groups'] || [];

            console.log('SAML authentication successful:', { userId, email, displayName, groups });

            // Generate JWT tokens
            const { token, refreshToken } = await AuthManager.generateToken(userId, email, displayName, groups);

            return {
                token,
                refreshToken,
                user: {
                    userId,
                    email,
                    name: displayName,
                    firstName,
                    lastName
                }
            };
        } catch (error) {
            console.error('SAML validation error:', error);
            return null;
        }
    }

    static async getLoginUrl(): Promise<string> {
        if (!saml) return '/auth/saml/callback';
        return saml.getAuthorizeUrl({});
    }

    static async getLogoutUrl(nameID: string): Promise<string> {
        if (!saml) return '/';
        return saml.getLogoutUrl({ nameID } as any);
    }
}
