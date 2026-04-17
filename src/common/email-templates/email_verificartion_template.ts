export const VerifyEmailTemplate = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
  <head>
    <title>Verify your email</title>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <!--[if !mso]><!-->
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <!--<![endif]-->
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="telephone=no, date=no, address=no, email=no, url=no" name="format-detection" />
    <style type="text/css">
      table { border-collapse: separate; table-layout: fixed; mso-table-lspace:0pt; mso-table-rspace:0pt; }
      img { border: 0; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode:bicubic; }
      .ExternalClass, .ExternalClass * { line-height:100%; }
      a { text-decoration: none; }
      /* Mobile tweaks */
      @media (max-width:480px){
        .container { width: 100% !important; }
        .px { padding-left:16px !important; padding-right:16px !important; }
        .btn { width: 100% !important; }
      }
    </style>
    <!--[if !mso]><!-->
    <!--<![endif]-->
  </head>
  <body style="margin:0; padding:0; background-color:#ffffff;">
    <center role="article" aria-roledescription="email" lang="en" style="width:100%; background-color:#ffffff;">
      <!-- Outer wrapper -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center">
        <tr>
          <td align="center" style="padding:24px 12px;">
            <!-- Card -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="container" style="width:600px; max-width:600px; background:#ffffff; border:1px solid #F4F2FD; border-radius:16px; box-shadow:0 1px 4px rgba(25,13,87,0.04);">

              <!-- NEW: Logo row (from second template, simplified) -->
              <tr>
                <td class="px" align="left" style="padding:20px 24px 0 24px;">
                  <img
                    src="{{s3_public_url}}logo.png"
                    width="100"
                    height="15"
                    alt="2Connect"
                    style="display:block; border:0; height:auto; width:100%; max-width:100px; margin:0;"
                  />
                </td>
              </tr>

              <!-- NEW: Chat icon row (from second template, simplified) -->
              <tr>
                <td class="px" align="center" style="padding:24px 24px 0 24px;">
                  <img
                    src="{{s3_public_url}}chat.png"
                    width="56"
                    height="56"
                    alt=""
                    style="display:block; border:0; height:auto; width:56px; max-width:100%; margin:0;"
                  />
                </td>
              </tr>

              <!-- Title (icon removed) -->
              <tr>
                <td class="px" align="center" style="padding:28px 24px 0 24px;">
                  <h1 style="margin:0; font:500 24px Arial, Arial, sans-serif; color:#190D57; line-height:32px;">Verify your email</h1>
                </td>
              </tr>

              <!-- Intro -->
              <tr>
                <td class="px" style="padding:16px 24px 0 24px;">
                  <p style="margin:0; font:500 14px Arial, Arial, sans-serif; color:#364151; line-height:20px;">
                    Hi {{name}},
                  </p>
                  <p style="margin:8px 0 0 0; font:500 14px Arial, Arial, sans-serif; color:#364151; line-height:20px;">
                    Use the code below to confirm your email for 2Connect. This code will expire soon.
                  </p>
                </td>
              </tr>

              <!-- Verification CODE block -->
              <tr>
                <td class="px" align="center" style="padding:20px 24px 0 24px;">
                  <div style="display:inline-block; background:#F7F5FF; border:1px solid #E8E4FB; border-radius:12px; padding:14px 18px;">
                    <code style="font:700 24px 'Arial', Arial, sans-serif; letter-spacing:4px; color:#190D57;">
                      {{code}}
                    </code>
                  </div>
                  <div style="height:8px; line-height:8px; font-size:8px;">&nbsp;</div>
                  <p style="margin:0; font:500 12px Arial, Arial, sans-serif; color:#6D717F; line-height:18px;">
                    Enter this code in the app to verify your email.
                  </p>
                </td>
              </tr>

              <!-- Help / Safety copy -->
              <tr>
                <td class="px" style="padding:20px 24px 0 24px;">
                  <p style="margin:0; font:500 12px Arial, Arial, sans-serif; color:#4A5462; line-height:18px;">
                    Didn’t request this? You can ignore this email. For help, contact
                    <a href="mailto:{{
                      support_email
                    }}" style="color:#267791; font-weight:600;">support@2connect.ai</a>.
                  </p>
                </td>
              </tr>

              <!-- Spacer -->
              <tr><td style="height:20px; line-height:20px; font-size:20px;">&nbsp;</td></tr>

              <!-- NEW: Social icons row (from second template, simplified) -->
              <tr>
                <td class="px" align="center" style="padding:0 24px 8px 24px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                    <tr>
                      <td style="padding:0 6px;">
                        <a href="{{linkedin_url}}" target="_blank" style="font-size:0;">
                          <img
                            src="{{s3_public_url}}linkedin.png"
                            width="24"
                            height="24"
                            alt="LinkedIn"
                            style="display:block; border:0; height:auto; width:24px; max-width:100%; margin:0;"
                          />
                        </a>
                      </td>
                      <td style="padding:0 6px;">
                        <a href="{{twitter_url}}" target="_blank" style="font-size:0;">
                          <img
                            src="{{s3_public_url}}twitter.png"
                            width="24"
                            height="24"
                            alt="X"
                            style="display:block; border:0; height:auto; width:24px; max-width:100%; margin:0;"
                          />
                        </a>
                      </td>
                      <td style="padding:0 6px;">
                        <a href="{{facebook_url}}" target="_blank" style="font-size:0;">
                          <img
                            src="{{s3_public_url}}facebook.png"
                            width="24"
                            height="24"
                            alt="Facebook"
                            style="display:block; border:0; height:auto; width:24px; max-width:100%; margin:0;"
                          />
                        </a>
                      </td>
                      <td style="padding:0 6px;">
                        <a href="{{youtube_url}}" target="_blank" style="font-size:0;">
                          <img
                            src="{{s3_public_url}}youtube.png"
                            width="24"
                            height="24"
                            alt="YouTube"
                            style="display:block; border:0; height:auto; width:24px; max-width:100%; margin:0;"
                          />
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer (short) -->
              <tr>
                <td class="px" align="center" style="padding:16px 24px 24px 24px; border-top:1px solid #F4F2FD;">
                  <p style="margin:0; font:500 10px Arial, Arial, sans-serif; color:#4A5462; line-height:16px;">
                    © 2026 2Connect. All rights reserved.
                    &nbsp;&middot;&nbsp;<a href="{{privacy_url}}" style="color:#267791; font-weight:600;">Privacy policy</a>
                    &nbsp;&middot;&nbsp;<a href="{{terms_url}}" style="color:#267791; font-weight:600;">Terms</a>
                  </p>
                </td>
              </tr>
            </table>
            <!-- /Card -->
          </td>
        </tr>
      </table>
      <!-- /Outer wrapper -->
    </center>
  </body>
</html>`;
