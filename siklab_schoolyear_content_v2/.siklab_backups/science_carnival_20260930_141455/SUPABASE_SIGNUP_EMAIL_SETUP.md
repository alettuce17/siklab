# Finish SikLab teacher signup email setup

The browser calls Supabase Auth `signUp()`. The message **Error sending confirmation email** is returned by Supabase while it attempts to deliver the confirmation email. Installing website files cannot change the cloud project's mail sender.

1. Open your SikLab project in Supabase. Go to **Authentication → Logs** and inspect the failed signup at its timestamp. If the log says `email_address_not_authorized`, the default sender cannot deliver to that recipient. If it reports SMTP, `gomail`, or a 500 error, check the SMTP connection and sender. If it points to a template, repair the **Confirm sign up** email template.
2. For teachers outside the Supabase organization, configure **Custom SMTP** under Supabase Authentication settings. Use a verified sender address and the host, port, username, and password supplied by your email provider. Enter those credentials in Supabase, never in SikLab JavaScript or this ZIP. Keep **Confirm Email** enabled.
3. Under **Authentication → URL Configuration**, set the Site URL to your deployed SikLab address and add that address to Redirect URLs. SikLab uses the current website URL as `emailRedirectTo`.
4. Save the settings and try one signup. Check the inbox and spam folder. If an account was created by an earlier attempt, use **Resend Confirmation Email** or sign in after confirmation. Check the Auth log again if delivery fails.

The default Supabase email sender is limited to organization members and currently has a low hourly limit. See Supabase's official [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp), [Auth error troubleshooting](https://supabase.com/docs/guides/troubleshooting/resolving-500-status-authentication-errors-7bU5U8), and [redirect URL setup](https://supabase.com/docs/guides/auth/redirect-urls).
