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
  const TABLE = 'Profiles';
  const fields = ['BaseHero_Type','SecondHero_Type','StressHero1_Type','StressHero2_Type','Paid_URL','Kombi_URL','S1_URL','S2_URL'];
  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  const filterFormula = encodeURIComponent(`{ProfileID}="${profileId}"`);
  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}?filterByFormula=${filterFormula}&${fieldParams}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      return { statusCode: response.status, body: JSON.stringify({ error: 'Airtable API error' }) };
    }

    const data = await response.json();

    if (!data.records || data.records.length === 0) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Profile not found' }) };
    }

    const f = data.records[0].fields;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        base:      f['BaseHero_Type']    || '',
        second:    f['SecondHero_Type']  || '',
        s1:        f['StressHero1_Type'] || '',
        s2:        f['StressHero2_Type'] || '',
        paid_url:  f['Paid_URL']         || '#',
        kombi_url: f['Kombi_URL']        || '#',
        s1_url:    f['S1_URL']           || '#',
        s2_url:    f['S2_URL']           || '#',
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
