<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Recupera tu contraseña</title>
</head>
<body style="margin:0; padding:0; background-color:#F0F4F2; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing:antialiased;">
  <!-- Preheader oculto -->
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#F0F4F2; font-size:1px; line-height:1px;">
    Restablece la contraseña de tu cuenta de Santa Cruz Suite. El enlace vence en {{ $expiresMinutes }} minutos.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0F4F2; padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#FFFFFF; border-radius:20px; overflow:hidden; box-shadow:0 12px 40px rgba(18,25,31,0.12);">

          <!-- Encabezado con gradiente obsidiana/verde -->
          <tr>
            <td style="background:linear-gradient(135deg, #12191F 0%, #1E2D2F 55%, #234029 100%); padding:36px 40px 30px; text-align:center;">
              <img src="{{ $message->embed(public_path('logo-scs.png')) }}" alt="Santa Cruz Suite" width="72" height="72" style="display:inline-block; border:0; outline:none; margin-bottom:14px;">
              <div style="font-size:22px; font-weight:700; letter-spacing:-0.02em; color:#FFFFFF; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                SantaCruz<span style="color:#7BC456;">Suite</span>
              </div>
              <div style="margin-top:6px; font-size:13px; color:#8AA39A; letter-spacing:0.03em;">
                Plataforma de herramientas del Grupo Santa Cruz
              </div>
            </td>
          </tr>

          <!-- Cuerpo -->
          <tr>
            <td style="padding:40px 40px 8px;">
              <span style="display:inline-block; background:rgba(87,173,49,0.12); color:#498f2a; font-size:12px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; padding:6px 12px; border-radius:999px;">
                Recuperación de contraseña
              </span>
              <h1 style="margin:18px 0 12px; font-size:24px; line-height:1.3; color:#12191F; font-weight:700;">
                Hola{{ $userName ? ', ' . $userName : '' }} 👋
              </h1>
              <p style="margin:0 0 16px; font-size:15px; line-height:1.65; color:#4A5568;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta en
                <strong style="color:#12191F;">Santa Cruz Suite</strong>. Pulsa el botón para crear una
                contraseña nueva y segura.
              </p>
            </td>
          </tr>

          <!-- Botón -->
          <tr>
            <td align="center" style="padding:12px 40px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:12px; background:linear-gradient(135deg, #71bf4c 0%, #57AD31 55%, #498f2a 100%); box-shadow:0 8px 18px rgba(65,128,36,0.28);">
                    <a href="{{ $resetUrl }}" target="_blank"
                       style="display:inline-block; padding:15px 42px; font-size:15px; font-weight:600; color:#FFFFFF; text-decoration:none; border-radius:12px; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                      Restablecer mi contraseña
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Aviso de expiración -->
          <tr>
            <td style="padding:4px 40px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F2; border:1px solid #D5DDD9; border-radius:12px;">
                <tr>
                  <td style="padding:14px 18px; font-size:13px; line-height:1.5; color:#4A5568;">
                    ⏱️ Por seguridad, este enlace vence en <strong style="color:#12191F;">{{ $expiresMinutes }} minutos</strong>.
                    Si expira, solicita uno nuevo desde la pantalla de inicio de sesión.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Enlace alternativo -->
          <tr>
            <td style="padding:16px 40px 8px;">
              <p style="margin:0 0 6px; font-size:12px; color:#8AA39A;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:
              </p>
              <p style="margin:0; font-size:12px; line-height:1.5; word-break:break-all;">
                <a href="{{ $resetUrl }}" style="color:#498f2a; text-decoration:underline;">{{ $resetUrl }}</a>
              </p>
            </td>
          </tr>

          <!-- Nota de seguridad -->
          <tr>
            <td style="padding:20px 40px 32px;">
              <hr style="border:none; border-top:1px solid #E5EBE8; margin:0 0 18px;">
              <p style="margin:0; font-size:13px; line-height:1.6; color:#8AA39A;">
                ¿No solicitaste este cambio? Puedes ignorar este correo con tranquilidad; tu contraseña
                actual seguirá siendo válida y nadie podrá acceder a tu cuenta sin ella.
              </p>
            </td>
          </tr>

          <!-- Pie -->
          <tr>
            <td style="background:#12191F; padding:24px 40px; text-align:center;">
              <div style="font-size:13px; font-weight:600; color:#FFFFFF; margin-bottom:4px;">
                SantaCruz<span style="color:#7BC456;">Suite</span>
              </div>
              <div style="font-size:11px; color:#8AA39A; line-height:1.6;">
                © {{ date('Y') }} Grupo Santa Cruz · Este es un mensaje automático, por favor no respondas a este correo.
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
