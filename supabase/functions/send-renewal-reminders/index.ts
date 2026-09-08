// Runs once a day (via pg_cron, see the SQL snippet in the deploy notes).
// Checks the single `subscription` row: sends a reminder email starting 7
// days before `renews_at`, and auto-flips status to 'expired' once the date
// has passed (App.jsx blocks the whole app for every role at that point,
// until the developer manually sets status back to 'active' + a new
// renews_at from the Supabase Dashboard - the "access control stays with
// me" requirement).
//
// Deploy: supabase functions deploy send-renewal-reminders --no-verify-jwt
// Secrets: supabase secrets set RESEND_API_KEY=<resend.com API key>
//          supabase secrets set RESEND_FROM="Restro Hisaab <renewals@yourdomain.com>"
//          (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY same as create-user)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REMINDER_WINDOW_DAYS = 7;

function daysBetween(a, b) {
  return Math.ceil((a.getTime() - b.getTime()) / 86400000);
}

async function sendEmail(to, subject, html) {
  const from = Deno.env.get('RESEND_FROM') || 'Restro Hisaab <onboarding@resend.dev>';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html })
  });
}

function paymentBlock(sub) {
  if (!sub.upi_vpa) return '';
  const amountText = sub.amount ? `₹${sub.amount}` : 'aapka yearly amount';
  return `<p><b>Renew karne ke liye:</b> ${amountText} is UPI ID par bhejein: <b>${sub.upi_vpa}</b>${sub.upi_payee_name ? ` (${sub.upi_payee_name})` : ''}.<br/>Payment ke baad hume bata dein, hum turant activate kar denge.</p>`;
}

Deno.serve(async () => {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: sub } = await admin.from('subscription').select('*').eq('id', 'main').maybeSingle();
    if (!sub) return new Response('no subscription row', { status: 200 });

    const today = new Date(new Date().toISOString().slice(0, 10));
    const renewsAt = new Date(sub.renews_at);
    const daysLeft = daysBetween(renewsAt, today);
    const todayStr = today.toISOString().slice(0, 10);
    if (sub.last_reminder_sent_at === todayStr) return new Response('already sent today', { status: 200 });

    const { data: owner } = await admin.from('profiles').select('email, name').eq('role', 'super_admin').eq('active', true).limit(1).maybeSingle();
    if (!owner?.email) return new Response('no super_admin email on file', { status: 200 });

    if (daysLeft < 0 && sub.status !== 'expired') {
      await admin.from('subscription').update({ status: 'expired', last_reminder_sent_at: todayStr }).eq('id', 'main');
      await sendEmail(
        owner.email,
        'Aapka Restro Hisaab subscription expire ho gaya hai',
        `<p>Namaste ${owner.name || ''},</p><p>Aapka yearly subscription expire ho chuka hai - app abhi ke liye suspend hai.</p>${paymentBlock(sub)}`
      );
    } else if (daysLeft >= 0 && daysLeft <= REMINDER_WINDOW_DAYS && sub.status === 'active') {
      await admin.from('subscription').update({ last_reminder_sent_at: todayStr }).eq('id', 'main');
      await sendEmail(
        owner.email,
        daysLeft === 0 ? 'Aapka Restro Hisaab subscription aaj renew hona hai' : `Aapka Restro Hisaab subscription ${daysLeft} din mein renew hona hai`,
        `<p>Namaste ${owner.name || ''},</p><p>Aapka yearly subscription ${sub.renews_at} ko renew hona hai.</p>${paymentBlock(sub)}`
      );
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    return new Response(err.message || 'error', { status: 500 });
  }
});
