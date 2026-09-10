# 📧 Gabay sa EmailJS Template at Configuration (EmailJS Setup & Template Guide)

Ang ClassCare ay may built-in integration sa **EmailJS** para sa agarang pagpapadala ng:
1. **Attendance Notifications sa Magulang** (Real-time alert sa magulang kapag nag-time in o na-late ang estudyante).
2. **Weekly Wellness & Attendance Digest** (Lingguhang summary ng attendance at emotional check-in/mood ng bata).

---

## 📍 Saan Ilalagay ang Template? (Where to Put the Template)

1. Pumunta sa [https://dashboard.emailjs.com/](https://dashboard.emailjs.com/) at mag-login.
2. Sa kaliwang sidebar (left navigation), i-click ang **Email Templates**.
3. I-click ang **Create New Template** (o i-edit ang iyong existing template, e.g. `template_8n7s2sa`).
4. Sa itaas, i-click ang **Settings** tab ng template para i-set ang **Template ID** (halimbawa: `template_8n7s2sa`).
5. Sa **Email Service**, siguraduhing naka-link ang iyong configured Service (halimbawa: `service_yrg7r4h` galing sa Gmail o Outlook integration).

---

## 🏷️ Mga Field sa EmailJS Template Editor

| Setting sa EmailJS | Ilalagay na Value | Paliwanag |
|---|---|---|
| **To Email** | `{{to_email}}` | Dito ipapadala ang email (Parent's registered email) |
| **From Name** | `ClassCare Notification` (o `{{from_name}}`) | Pangalan ng paaralan o system |
| **Subject** | `ClassCare Alert: {{student_name}} - {{status}} ({{date}})` | Pamagat ng email |
| **Reply-To** | `support@classcare.edu` (o email ng admin) | Reply address |

---

## 📋 Kumpletong Listahan ng Parameters (Variables)

Ang mga sumusunod na variables ay awtomatikong ipinapasa ng ClassCare code sa EmailJS:

| Variable | Halimbawa ng Value | Saan Ginagamit |
|---|---|---|
| `{{to_email}}` | `parent@example.com` | Email address ng magulang |
| `{{recipient_email}}` | `parent@example.com` | Fallback alias para sa email address |
| `{{student_name}}` | `Juan Dela Cruz` | Buong pangalan ng estudyante |
| `{{student_id}}` | `2025-1042` | Student LRN / ID number |
| `{{section}}` | `Grade 5 - Einstein` | Baitang at seksyon ng estudyante |
| `{{date}}` | `2026-09-07` | Petsa ng attendance o ulat |
| `{{status}}` | `Present` / `Late` / `Absent` | Katayuan sa pagpasok |
| `{{time_in}}` | `07:38 AM` | Oras ng pag-scan sa QR code |
| `{{message}}` | `Attendance update for Juan: Present at 07:38 AM.` | Buong deskripsyon o lingguhang buod |
| `{{attendance_summary}}` | `5 Present, 0 Late, 0 Absent (past 7 days)` | Buod para sa Weekly Digest |
| `{{wellness_summary}}` | `4 positive days, 1 challenging days` | Buod ng emotional check-in |

---

## 📝 1. HTML Email Template (Inirerekomenda / Recommended)

Kopyahin ang buong HTML code sa ibaba at i-paste sa **Content -> Code Editor** (o HTML tab) ng iyong EmailJS template:

```html
<!DOCTYPE html>
<html lang="tl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClassCare Student Notification</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; }
    .email-container { max-width: 560px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 28px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { margin: 6px 0 0 0; font-size: 14px; opacity: 0.9; }
    .body-content { padding: 24px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-present { background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
    .badge-late { background-color: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .badge-absent { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
    .info-box { background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 16px; margin: 18px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #64748b; font-weight: 500; }
    .info-val { color: #0f172a; font-weight: 600; text-align: right; }
    .message-card { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 16px; border-radius: 4px; font-size: 14px; line-height: 1.5; color: #1e3a8a; margin-top: 16px; }
    .footer { background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🏫 ClassCare School Portal</h1>
      <p>Official Attendance &amp; Student Wellness Notification</p>
    </div>
    
    <div class="body-content">
      <p style="font-size: 15px; margin-top: 0;">Magandang araw / Dear Parent or Guardian,</p>
      
      <p style="font-size: 14px; color: #475569;">
        Ito ay opisyal na abiso ukol sa talaan ng inyong anak sa paaralan:
      </p>

      <div style="text-align: center; margin: 16px 0;">
        <span class="badge badge-present">{{status}}</span>
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="info-label">Pangalan ng Mag-aaral:</span>
          <span class="info-val">{{student_name}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Student ID / LRN:</span>
          <span class="info-val">{{student_id}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Baitang at Seksyon:</span>
          <span class="info-val">{{section}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Petsa:</span>
          <span class="info-val">{{date}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Oras ng Pagtala:</span>
          <span class="info-val">{{time_in}}</span>
        </div>
      </div>

      <div class="message-card">
        <strong>Pabatid / Summary:</strong><br>
        {{message}}
      </div>
    </div>

    <div class="footer">
      <p style="margin: 0 0 4px 0;">Pinapagana ng <strong>ClassCare Learning &amp; Emotional Wellness Platform</strong></p>
      <p style="margin: 0;">Awtomatikong ipinadala mula sa paaralan. Hindi kailangang sagutin ang mensaheng ito.</p>
    </div>
  </div>
</body>
</html>
```

---

## 📄 2. Plain Text Email Template (Fallback Option)

Kung nais ng plain text lamang:

```text
ClassCare Attendance & Wellness Notification
-------------------------------------------
Magandang araw!

Ito ay opisyal na abiso para kay {{student_name}} (ID: {{student_id}}), Seksyon: {{section}}.

Status: {{status}}
Petsa: {{date}}
Oras ng Time In: {{time_in}}

Pabatid / Buod:
{{message}}

-------------------------------------------
ClassCare School Portal
Awtomatikong ipinadala mula sa paaralan.
```

---

## ⚙️ Paano I-save at I-test sa ClassCare

Maaari mong i-configure at i-test ang EmailJS sa **dalawang paraan**:

### Paraan 1: Sa `js/config.js` (Code-level default)
Buksan ang [`js/config.js`](file:///c:/Users/nelvi/Downloads/classcare/js/config.js) at ilagay ang mga keys:
```javascript
emailjs: {
  publicKey:  "oUql9H9PuBblymdqY",
  serviceId:  "service_yrg7r4h",
  templateId: "template_8n7s2sa"
}
```

### Paraan 2: Sa Admin Portal -> Settings (Live Web UI)
1. Buksan ang **Admin Portal** (`http://localhost:5500/admin/`).
2. Pumunta sa **Settings** tab.
3. Hanapin ang bagong seksyon na **"EmailJS Configuration & Template Tester"**.
4. Maaari mong baguhin ang `Service ID`, `Template ID`, at `Public Key`.
5. I-type ang iyong personal email sa **Test Recipient Email** field at pindutin ang **"Send Test Alert Email"**.
6. Makakatanggap ka ng kumpirmasyon sa loob ng ilang segundo!
