// ============================================================
// Sends the digital permit to the officer via WhatsApp using
// Twilio's WhatsApp API.
//
// Requires these Netlify environment variables (Site settings →
// Environment variables):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_WHATSAPP_FROM      e.g. "whatsapp:+14155238886" (sandbox)
//                             or your approved WhatsApp Business number
// ============================================================

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const {
      phone, officerName, idNumber, competencyNumber,
      firearm, ammo, location, validUntil, issuerName, verifyUrl,
    } = JSON.parse(event.body);

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: false, error: "Twilio credentials not configured on server." }),
      };
    }

    const messageBody =
`*IMPI PROTECTION AGENCY — DIGITAL FIREARM PERMIT*

Officer: ${officerName}
ID Number: ${idNumber}
Competency No.: ${competencyNumber}

Firearm: ${firearm}
Ammunition issued: ${ammo}
Duty location: ${location || "—"}

Valid until: ${new Date(validUntil).toLocaleString("en-ZA")}
Issued by: ${issuerName}

Verify this permit: ${verifyUrl}

Keep this message and your physical competency certificate on you at all times while on duty.

_IMPI Protection Agency (Pty) Ltd_
_10 Kosmos Crescent, Rynoue AH, Roodeplaat, Pretoria_
_info@impi-secure.co.za | 083 782 2207_`;

    const formattedTo = phone.startsWith("whatsapp:") ? phone : `whatsapp:+${phone.replace(/^\+/, "")}`;

    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: formattedTo,
          Body: messageBody,
        }),
      }
    );

    const data = await resp.json();

    if (!resp.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: false, error: data.message || "Twilio send failed" }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, sid: data.sid }) };
  } catch (err) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
