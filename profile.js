exports.handler = async function(event) {
  const qp = event.queryStringParameters || {};
  const profileId = qp.id;
  const email = qp.email;
  const token = process.env.AIRTABLE_TOKEN;

  if (!profileId && !email) {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: 'Missing id or email parameter' }) };
  }
  if (!token) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: 'Token not configured' }) };
  }

  const BASE_ID = 'appO19P3GW2gNHFWm';
  const UPGRADE_URL = 'https://myablefy.com/s/6heroes/testprodukt-zapier-7ae4eae2/payment';

  // Netto-Felder (Profiles). Reihenfolge = HEROES-Reihenfolge im Frontend.
  const NETTO_FIELDS = {
    ni: 'energie_netto_innovator',
    nc: 'energie_netto_commander',
    nst:'energie_netto_strategist',
    ns: 'energie_netto_sage',
    ng: 'energie_netto_guardian',
    ne: 'energie_netto_explorer',
  };

  function cors() {
    return { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  }

  try {
    // 1. HeroTypes-Map (nur nötig, falls Hero-Felder als Record-IDs kommen)
    const heroTypesUrl = `https://api.airtable.com/v0/${BASE_ID}/HeroTypes?fields[]=HeroTypeID`;
    const heroTypesRes = await fetch(heroTypesUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!heroTypesRes.ok) {
      const errText = await heroTypesRes.text();
      return { statusCode: heroTypesRes.status, headers: cors(), body: JSON.stringify({ error: 'HeroTypes API error', details: errText }) };
    }
    const heroTypesData = await heroTypesRes.json();
    const heroMap = {};
    (heroTypesData.records || []).forEach(r => {
      heroMap[r.id] = r.fields['HeroTypeID'] || r.id;
    });

    // 2. Profil-Record holen — per ProfileID ODER per E-Mail (aktuelles Profil).
    const fields = [
      'BaseHero_Type','SecondHero_Type','StressHero1_Type','StressHero2_Type',
      'Paid_URL','Kombi_URL','S1_URL','S2_URL','UserID_LU_Text',
      ...Object.values(NETTO_FIELDS)
    ];
    const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');

    // Filter: bei email zusätzlich IsCurrent=1, damit Retests nicht das alte Profil liefern.
    // {User} ist das E-Mail-Feld in Profiles (siehe CSV); UserID_LU_Text ist identisch, {User} ist der Primärbezug.
    const filterFormula = email
      ? encodeURIComponent(`AND({User}="${email}",{IsCurrent}=1)`)
      : encodeURIComponent(`{ProfileID}="${profileId}"`);
    const profileUrl = `https://api.airtable.com/v0/${BASE_ID}/Profiles?filterByFormula=${filterFormula}&${fieldParams}`;

    const profileRes = await fetch(profileUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      return { statusCode: profileRes.status, headers: cors(), body: JSON.stringify({ error: 'Profiles API error', details: errText }) };
    }
    const profileData = await profileRes.json();

    if (!profileData.records || profileData.records.length === 0) {
      return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: 'Profile not found' }) };
    }

    const f = profileData.records[0].fields;

    function resolveHero(value) {
      if (!value) return '';
      if (Array.isArray(value)) {
        const recId = value[0];
        return heroMap[recId] || recId || '';
      }
      return String(value);
    }

    // Nettos einsammeln: Zahl oder null (Feld leer / kein Assessment).
    const nettos = {};
    for (const [key, field] of Object.entries(NETTO_FIELDS)) {
      const raw = f[field];
      const num = (raw === '' || raw === undefined || raw === null) ? null : parseFloat(raw);
      nettos[key] = (num === null || Number.isNaN(num)) ? null : num;
    }

    // 3. Is_Paid_Now aus Users via UserID_LU_Text (unverändert).
    let isPaid = false;
    const userEmail = f['UserID_LU_Text'] || email;
    if (userEmail) {
      const userFilter = encodeURIComponent(`{UserID}='${userEmail}'`);
      const usersUrl = `https://api.airtable.com/v0/${BASE_ID}/Users?filterByFormula=${userFilter}&fields[]=Is_Paid_Now`;
      const usersRes = await fetch(usersUrl, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        if (usersData.records && usersData.records.length > 0) {
          isPaid = !!usersData.records[0].fields['Is_Paid_Now'];
        }
      }
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
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
        upgrade_url: UPGRADE_URL,
      })
    };
  } catch (err) {
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: err.message }) };
  }
};
