/* global process */
import { Resend } from 'resend'

const CONTACT_EMAIL = '26.2room@internet.ru'
const CC_EMAIL = 'oleg_191090@mail.ru'

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const getSubject = (type) => {
  if (type === 'race') {
    return 'Новая заявка: добавить старт в 26.2 ROOM'
  }

  if (type === 'partner') {
    return 'Новая заявка: партнёрство с 26.2 ROOM'
  }

  return 'Новая заявка с сайта 26.2 ROOM'
}

const getTypeLabel = (type) => {
  if (type === 'race') {
    return 'Добавить старт'
  }

  if (type === 'partner') {
    return 'Партнёрство'
  }

  return 'Обращение с сайта'
}

const buildHtml = ({ type, fields }) => {
  const submittedAt = new Date().toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    dateStyle: 'long',
    timeStyle: 'short',
  })

  const fieldRows = Object.entries(fields)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #27272a;color:#a1a1aa;font-weight:700;vertical-align:top;width:34%;">${escapeHtml(label)}</td>
          <td style="padding:12px 14px;border-bottom:1px solid #27272a;color:#ffffff;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value || '—')}</td>
        </tr>
      `,
    )
    .join('')

  return `
    <div style="margin:0;padding:28px;background:#050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:720px;margin:0 auto;border:1px solid rgba(255,214,0,0.24);border-radius:28px;overflow:hidden;background:#09090b;">
        <div style="padding:30px;background:linear-gradient(135deg,rgba(255,214,0,0.18),rgba(255,214,0,0.03));">
          <div style="color:#FFD600;font-size:13px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">26.2 ROOM</div>
          <h1 style="margin:12px 0 0;color:#ffffff;font-size:30px;line-height:1.1;">Новая заявка с сайта</h1>
          <p style="margin:14px 0 0;color:#d4d4d8;font-size:16px;line-height:1.55;">Тип заявки: <strong style="color:#FFD600;">${escapeHtml(getTypeLabel(type))}</strong></p>
        </div>

        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
          <tbody>
            ${fieldRows}
            <tr>
              <td style="padding:12px 14px;color:#a1a1aa;font-weight:700;vertical-align:top;">Дата и время</td>
              <td style="padding:12px 14px;color:#ffffff;vertical-align:top;">${escapeHtml(submittedAt)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed' })
  }

  const { type, fields } = request.body || {}

  if (!type || !fields || typeof fields !== 'object' || Array.isArray(fields)) {
    return response.status(400).json({ error: 'Invalid request' })
  }

  if (!process.env.RESEND_API_KEY) {
    return response.status(500).json({ error: 'Email service is not configured' })
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send({
      from: '26.2 ROOM <onboarding@resend.dev>',
      to: [CONTACT_EMAIL],
      cc: [CC_EMAIL],
      subject: getSubject(type),
      html: buildHtml({ type, fields }),
    })

    if (error) {
      console.error('Resend error:', error)
      return response.status(500).json({ ok: false, error: 'Email sending failed', details: error })
    }

    if (data) {
      console.log('Resend success:', data)
      return response.status(200).json({ ok: true, id: data.id, data })
    }

    return response.status(500).json({ ok: false, error: 'No response from Resend' })
  } catch (error) {
    console.error('Resend request failed:', error)
    return response.status(500).json({ error: 'Failed to send request' })
  }
}
