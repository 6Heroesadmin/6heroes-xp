/* Build 2026-11-23 v1.2 (LISTE 10): Zugriff nur noch mit E-Mail UND Seiten_Schluessel (k).
   - k = Auth_Users_Noloco.Seiten_Schluessel (RECORD_ID), kommt aus dem Noloco-iframe, Format ^rec[A-Za-z0-9]{14}$.
   - Prüfung in Users: AND(LOWER({UserID})='<email>', {Seiten_Schluessel_LU}='<k>'), wie bei Account/Coach.
   - Abruf per ProfileID (?id=) entfernt, weil die ID aus der E-Mail ableitbar ist.
   - CORS nur noch für start.6heroes.de und regal-mooncake; keine Fehlerdetails mehr nach außen; kein Caching.
   - upgrade_url auf https://6heroes.de/preise/ umgestellt. */
const ALLOWED_ORIGINS = ['https://start.6heroes.de', 'https://regal-mooncake-d3a250.netlify.app'];
const BASE_ID = 'appO19P3GW2gNHFWm';
const UPGRADE_URL = 'https://6heroes.de/preise/';
const EMAIL_RE = /^[^\s@'"\\]+@[^\s@'"\\]+\.[^\s@'"\\]+$/;
const KEY_RE = /^rec[A-Za-z0-9]{14}$/;

const NETTO_FIELDS = {
  ni: 'energie_netto_innovator',
  nc: 'energie_netto_commander',
  nst:'energie_netto_strategist',
  ns: 'energie_netto_sage',
  ng: 'energie_netto_guardian',
  ne: 'energie_netto_explorer',
};

function headers(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const h = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if (ALLOWED_ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function reply(event, status, obj) {
  return { statusCode: status, headers: headers(event), body: JSON.stringify(obj) };
}

async function airtable(path, token) {
  const res = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${path}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    console.error('Airtable', res.status, (await res.text()).slice(0, 300));
    throw new Error('airtable');
  }
  return res.json();
}

exports.handler = async function(event) {
  const qp = event.queryStringParameters || {};
  const email = String(qp.email || '').trim().toLowerCase();
  const k = String(qp.k || '').trim();
  const token = process.env.AIRTABLE_TOKEN;

  if (!EMAIL_RE.test(email) || !KEY_RE.test(k)) {
    return reply(event, 403, { error: 'forbidden' });
  }
  if (!token) {
    console.error('AIRTABLE_TOKEN fehlt');
    return reply(event, 500, { error: 'server' });
  }

  try {
    // 1. Berechtigung: E-Mail und Seiten_Schluessel müssen zum selben Nutzer gehören.
    const userFilter = encodeURIComponent(`AND(LOWER({UserID})='${email}',{Seiten_Schluessel_LU}='${k}')`);
    const usersData = await airtable(
      `Users?filterByFormula=${userFilter}&maxRecords=1&fields[]=Is_Paid_Now&fields[]=Profil_Sichtbar`, token);
    if (!usersData.records || usersData.records.length === 0) {
      return reply(event, 403, { error: 'forbidden' });
    }
    const uf = usersData.records[0].fields;
    const isPaid = !!Number(uf['Is_Paid_Now']);
    const profilFrei = isPaid || Number(uf['Profil_Sichtbar']) === 1;

    // 2. HeroTypes-Map (falls Hero-Felder als Record-IDs kommen).
    const heroTypesData = await airtable('HeroTypes?fields[]=HeroTypeID', token);
    const heroMap = {};
    (heroTypesData.records || []).forEach(r => { heroMap[r.id] = r.fields['HeroTypeID'] || r.id; });

    // 3. Aktuelles Profil zur E-Mail.
    const fields = [
      'BaseHero_Type','SecondHero_Type','StressHero1_Type','StressHero2_Type',
      'Paid_URL','Kombi_URL','S1_URL','S2_URL',
      ...Object.values(NETTO_FIELDS)
    ];
    const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const profileFilter = encodeURIComponent(`AND(LOWER({User})='${email}',{IsCurrent}=1)`);
    const profileData = await airtable(`Profiles?filterByFormula=${profileFilter}&maxRecords=1&${fieldParams}`, token);
    if (!profileData.records || profileData.records.length === 0) {
      return reply(event, 404, { error: 'not_found' });
    }
    const f = profileData.records[0].fields;

    const resolveHero = v => {
      if (!v) return '';
      if (Array.isArray(v)) return heroMap[v[0]] || v[0] || '';
      return String(v);
    };
    const nettos = {};
    for (const [key, field] of Object.entries(NETTO_FIELDS)) {
      const raw = f[field];
      const num = (raw === '' || raw === undefined || raw === null) ? null : parseFloat(raw);
      nettos[key] = (num === null || Number.isNaN(num)) ? null : num;
    }

    return reply(event, 200, {
      base:        resolveHero(f['BaseHero_Type']),
      second:      resolveHero(f['SecondHero_Type']),
      s1:          resolveHero(f['StressHero1_Type']),
      s2:          resolveHero(f['StressHero2_Type']),
      nettos:      nettos,
      paid_url:    f['Paid_URL']  || '#',
      kombi_url:   f['Kombi_URL'] || '#',
      s1_url:      f['S1_URL']    || '#',
      s2_url:      f['S2_URL']    || '#',
      isPaid:      isPaid,
      profilFrei:  profilFrei,
      upgrade_url: UPGRADE_URL,
    });
  } catch (err) {
    console.error(err);
    return reply(event, 500, { error: 'server' });
  }
};
