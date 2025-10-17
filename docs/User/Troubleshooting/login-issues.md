# Login and Authentication Issues

This guide helps resolve common login and authentication problems with MyTapTrack.

## Common Login Problems

### Cannot Remember Password

**Symptoms:**
- Forgot password
- Password not working after recent change
- Account locked due to multiple failed attempts

**Solution:**
1. Go to the MyTapTrack login page
2. Click "Forgot Password?" link
3. Enter your email address
4. Check your email for reset instructions (check spam folder)
5. Follow the link in the email (valid for 24 hours)
6. Create a new password following the requirements:
   - Minimum 8 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one number
   - At least one special character (!@#$%^&*)

**If you don't receive the reset email:**
- Check your spam/junk folder
- Verify you're using the correct email address
- Wait 5 minutes and try again
- Contact support if still no email after 15 minutes

### Account Locked

**Symptoms:**
- "Account locked" message appears
- Cannot login despite correct credentials
- Received email about suspicious activity

**Solution:**
1. Wait 15 minutes - accounts auto-unlock after this period
2. Use the "Forgot Password?" option to reset your password
3. If still locked, contact support with your username

**Prevention:**
- Use a password manager to avoid typos
- Don't share login credentials
- Log out properly when finished

### Two-Factor Authentication (2FA) Issues

**Symptoms:**
- 2FA code not working
- Lost access to 2FA device
- 2FA code expired

**Solution for Invalid Codes:**
1. Ensure your device clock is synchronized
2. Generate a new code (codes expire every 30 seconds)
3. Try the previous code if you just generated a new one
4. Check that you're using the correct authenticator app

**Solution for Lost 2FA Device:**
1. Use one of your backup codes (provided during 2FA setup)
2. If no backup codes, contact support with:
   - Your username
   - Alternative email address for verification
   - Recent account activity details

### Browser-Related Login Issues

**Symptoms:**
- Login page won't load
- Infinite redirect loops
- "Session expired" immediately after login

**Solution:**
1. Clear browser cache and cookies for mytaptrack.com
2. Disable browser extensions temporarily
3. Try incognito/private browsing mode
4. Update your browser to the latest version
5. Try a different browser

**Supported Browsers:**
- Chrome 90 or newer
- Firefox 88 or newer
- Safari 14 or newer
- Edge 90 or newer

### Corporate Network/Firewall Issues

**Symptoms:**
- Can login from home but not work
- Partial page loading
- Connection timeouts

**Solution:**
1. Contact your IT department about these required domains:
   - `*.mytaptrack.com`
   - `*.amazonaws.com` (for AWS services)
   - `*.cognito-idp.us-east-1.amazonaws.com` (for authentication)
2. Required ports: 443 (HTTPS), 80 (HTTP redirect)
3. Try using mobile data to confirm it's a network issue

### Single Sign-On (SSO) Issues

**Symptoms:**
- SSO login button not working
- Redirected to wrong organization
- "User not found" with SSO

**Solution:**
1. Verify you're using the correct SSO provider URL
2. Check with your organization's IT administrator
3. Ensure your SSO account has been provisioned for MyTapTrack
4. Try logging out of all SSO sessions and starting fresh

**For Administrators:**
- Verify SAML/OIDC configuration
- Check user attribute mappings
- Confirm group assignments

### Mobile App Login Issues

**Symptoms:**
- App crashes on login
- "Network error" on mobile
- Touch ID/Face ID not working

**Solution:**
1. Update the app to the latest version
2. Restart the app completely
3. Check mobile data/WiFi connection
4. Re-enable biometric authentication in app settings
5. Uninstall and reinstall the app as last resort

### Account Access After Team Changes

**Symptoms:**
- Removed from organization
- Role permissions changed
- Cannot access previous data

**Solution:**
1. Contact your organization administrator
2. Verify your role and permissions
3. If you've left the organization, contact support about data export options

## Error Messages and Solutions

### "Invalid username or password"
- Double-check spelling and capitalization
- Try typing password manually instead of copy/paste
- Use "Forgot Password?" if unsure

### "Account not found"
- Verify email address spelling
- Check if you have multiple email addresses
- Contact support if you're certain the account exists

### "Session expired"
- This is normal after 8 hours of inactivity
- Simply log in again
- If happening immediately, clear browser cache

### "Too many login attempts"
- Wait 15 minutes for automatic unlock
- Use password reset if you're unsure of credentials
- Contact support if problem persists

### "Browser not supported"
- Update your browser to a supported version
- Try a different supported browser
- Enable JavaScript if disabled

## When to Contact Support

**Contact support immediately if:**
- You suspect unauthorized access to your account
- You receive security alerts you didn't trigger
- Your account shows activity you didn't perform
- You cannot access your account after following all troubleshooting steps

**Information to provide to support:**
- Your username/email address
- Browser and version
- Error messages (screenshots helpful)
- Time when issue occurred
- Steps you've already tried

**Support Channels:**
- Email: support@mytaptrack.com
- Emergency: +1-800-TAPTRACK
- In-app chat (if you can partially access the system)