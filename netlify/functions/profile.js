exports.handler = async function(event) {
  const profileId = event.queryStringParameters && event.queryStringParameters.id;
  const token = process.env.AIRTABLE_TOKEN;

  if (!profileId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing id parameter' }) };
  }
  if (!token) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Token not configured' }) };
  }

  const BASE_ID = 'appO19P3GW2gNHFWm';

  try {
    // 1. Fetch HeroTypes table to build a recordID -> name map
    const heroTypesUrl = `https://api.airtable.com/v0/${BASE_ID}/HeroTypes?fields[]=HeroTypeID`;
    const heroTypesRes = await fetch(heroTypesUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!heroTypesRes.ok) {
      const errText = await heroTypesRes.text();
      return { statusCode: heroTypesRes.status, body: JSON.stringify({ error: 'HeroTypes API error', details: errText }) };
    }
    const heroTypesData = await heroTypesRes.json();
    const heroMap = {};
    (heroTypesData.records || []).forEach(r => {
      heroMap[r.id] = r.fields['HeroTypeID'] || r.id;
    });

    // 2. Fetch the Profile record
    const fields = ['BaseHero_Type','SecondHero_Type','StressHero1_Type','StressHero2_Type','Paid_URL','Kombi_URL','S1_URL','S2_URL'];
    const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
    const filterFormula = encodeURIComponent(`{ProfileID}="${profileId}"`);
    const profileUrl = `https://api.airtable.com/v0/${BASE_ID}/Profiles?filterByFormula=${filterFormula}&${fieldParams}`;

    const profileRes = await fetch(profileUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!profileRes.ok) {
      const errText = await profileRes.text();
      return { statusCode: profileRes.status, body: JSON.stringify({ error: 'Profiles API error', details: errText }) };
    }
    const profileData = await profileRes.json();

    if (!profileData.records || profileData.records.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Profile not found' }) };
    }

    const f = profileData.records[0].fields;

    // Resolve a linked-record field (array of record IDs) to its hero name
    function resolveHero(value) {
      if (!value) return '';
      if (Array.isArray(value)) {
        const recId = value[0];
        return heroMap[recId] || recId || '';
      }
      return String(value);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        base:      resolveHero(f['BaseHero_Type']),
        second:    resolveHero(f['SecondHero_Type']),
        s1:        resolveHero(f['StressHero1_Type']),
        s2:        resolveHero(f['StressHero2_Type']),
        paid_url:  f['Paid_URL']  || '#',
        kombi_url: f['Kombi_URL'] || '#',
        s1_url:    f['S1_URL']    || '#',
        s2_url:    f['S2_URL']    || '#',
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
